import os
from datetime import datetime, timedelta

from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_from_directory,
    session,
)

from storage import HISTORY

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, 'frontend', 'dist')

DEMO_USERNAME = 'demo'
ALLOWED_EXERCISES = ('squat', 'pushup', 'bicep_curl', 'shoulder_press', 'lunge')

secret_key = os.environ.get('SECRET_KEY')
if not secret_key:
    if os.environ.get('VERCEL'):
        raise RuntimeError('SECRET_KEY environment variable must be set in production')
    secret_key = 'dev-only-insecure-key'

app = Flask(__name__)
app.config.update(
    SECRET_KEY=secret_key,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=bool(os.environ.get('VERCEL')),
)

@app.before_request
def start_demo_session():
    session.setdefault('user_id', 1)
    session.setdefault('username', DEMO_USERNAME)


@app.context_processor
def inject_globals():
    return {'now': datetime.now()}


@app.route('/')
def landing():
    return render_template('landing.html')

@app.route('/dashboard')
def dashboard():
    week_start = datetime.now() - timedelta(days=7)
    totals = HISTORY.totals()
    return render_template(
        'dashboard.html',
        total_workouts=totals['workouts'],
        total_reps=totals['reps'],
        total_calories=totals['calories'],
        avg_form_score=totals['avg_form_score'],
        total_duration_str=totals['duration_str'],
        recent_workouts=HISTORY.recent(10),
        week_workouts=len(HISTORY.since(week_start)),
        workout_weekdays=HISTORY.weekdays_since(week_start),
        exercise_breakdown=HISTORY.breakdown(),
    )

@app.route('/calendar')
def calendar():
    today = datetime.now()
    day_totals = HISTORY.monthly(today.year, today.month)
    cells = [None] * today.replace(day=1).weekday()
    for day in range(1, 32):
        try:
            cells.append(today.replace(day=day))
        except ValueError:
            break
    cells += [None] * (-len(cells) % 7)
    calendar_days = [
        {
            'day': cell.day if cell else None,
            'is_today': bool(cell) and cell.day == today.day,
            'stats': day_totals.get(cell.day) if cell else None,
        }
        for cell in cells
    ]
    return render_template(
        'calendar.html',
        month_label=today.strftime('%B %Y'),
        calendar_days=calendar_days,
        recent_workouts=HISTORY.recent(30),
    )

@app.route('/vitals')
def vitals():
    return render_template('vitals.html')

@app.route('/community')
def community():
    return render_template('community.html')

@app.route('/nutrition')
def nutrition():
    return render_template('nutrition.html')

@app.route('/settings')
def settings():
    return render_template('settings.html')

@app.route('/api/workouts')
def get_workouts():
    return jsonify([
        {
            'id': workout.id,
            'date': workout.date.strftime('%Y-%m-%d'),
            'exercise': workout.exercise_type,
            'reps': workout.reps,
            'duration': workout.duration,
            'calories': workout.calories,
            'form_score': workout.form_score,
        }
        for workout in HISTORY.recent(200)
    ])

@app.route('/api/add_workout', methods=['POST'])
def add_workout():
    data = request.get_json(silent=True) or {}

    exercise = data.get('exercise')
    if exercise not in ALLOWED_EXERCISES:
        return jsonify({'error': f'exercise must be one of {list(ALLOWED_EXERCISES)}'}), 400

    try:
        reps = int(data.get('reps', 0))
        duration = int(data.get('duration', 0))
        calories = float(data.get('calories', 0))
        form_score = int(data.get('form_score', 100))
    except (TypeError, ValueError):
        return jsonify({'error': 'reps, duration, calories and form_score must be numeric'}), 400

    if reps < 1:
        return jsonify({'error': 'reps must be a positive integer'}), 400
    if min(duration, calories) < 0 or not 0 <= form_score <= 100:
        return jsonify({'error': 'values out of range'}), 400

    workout = HISTORY.add(exercise, reps, duration, calories, form_score, str(data.get('notes', '')))
    return jsonify({'success': True, 'workout_id': workout.id})

@app.route('/api/stats')
def get_stats():
    breakdown = HISTORY.breakdown()
    return jsonify({
        'exercise_breakdown': {
            'labels': [item['name'] for item in breakdown],
            'counts': [item['sessions'] for item in breakdown],
            'reps': [item['reps'] for item in breakdown],
        },
        'weekly_progress': HISTORY.weekly_progress(),
    })

@app.route('/trainer_ui')
def trainer_ui():
    return send_from_directory(DIST_DIR, 'index.html')

@app.route('/assets/<path:path>')
def serve_assets(path):
    return send_from_directory(os.path.join(DIST_DIR, 'assets'), path)

@app.route('/start_trainer')
def start_trainer():
    return render_template('web_trainer.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)