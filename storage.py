"""Workout history backed by a JSON seed file, cached in memory.

Writes are best-effort: they persist during local development and are dropped
silently on read-only hosts such as Vercel's serverless filesystem.
"""

import json
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta

HISTORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'workout_history.json')

_DATE_FORMATS = ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M')


@dataclass
class Workout:
    exercise_type: str
    reps: int
    duration: int
    calories: float
    form_score: int
    date: datetime
    notes: str = ''
    id: int = 0


def _parse_date(value):
    if not isinstance(value, str):
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value.strip(), fmt)
        except ValueError:
            continue
    return None


def _parse_duration(value):
    if isinstance(value, (int, float)):
        return max(0, int(value))
    if not isinstance(value, str):
        return 0
    text = value.strip().lower()
    if text.isdigit():
        return int(text)
    minutes = 0
    if 'm' in text:
        head, _, text = text.partition('m')
        minutes = int(head) if head.strip().isdigit() else 0
    digits = ''.join(char for char in text if char.isdigit())
    return minutes * 60 + (int(digits) if digits else 0)


class HistoryStore:
    def __init__(self, path=HISTORY_FILE):
        self.path = path
        self._lock = threading.Lock()
        self._items = []
        self._next_id = 1
        self._load()

    def _load(self):
        try:
            with open(self.path, encoding='utf-8') as handle:
                raw = json.load(handle)
        except (OSError, ValueError):
            return
        if not isinstance(raw, list):
            return
        for entry in raw:
            workout = self._from_entry(entry)
            if workout is None:
                continue
            workout.id = self._next_id
            self._next_id += 1
            self._items.append(workout)
        self._items.sort(key=lambda item: item.date)

    @staticmethod
    def _from_entry(entry):
        if not isinstance(entry, dict):
            return None
        exercise = entry.get('exercise')
        date = _parse_date(entry.get('date'))
        if not exercise or date is None:
            return None
        try:
            return Workout(
                exercise_type=str(exercise),
                reps=int(entry.get('reps') or 0),
                duration=_parse_duration(entry.get('duration')),
                calories=round(float(entry.get('calories') or 0), 2),
                form_score=int(entry.get('form_score') or 100),
                date=date,
                notes=str(entry.get('feedback') or ''),
            )
        except (TypeError, ValueError):
            return None

    def add(self, exercise_type, reps, duration, calories, form_score, notes=''):
        with self._lock:
            workout = Workout(
                exercise_type=exercise_type,
                reps=reps,
                duration=duration,
                calories=round(float(calories), 2),
                form_score=form_score,
                date=datetime.now().replace(microsecond=0),
                notes=notes,
                id=self._next_id,
            )
            self._next_id += 1
            self._items.append(workout)
            self._persist()
        return workout

    def _persist(self):
        payload = [
            {
                'username': 'demo',
                'date': item.date.strftime('%Y-%m-%d %H:%M'),
                'exercise': item.exercise_type,
                'reps': item.reps,
                'duration': f'{item.duration // 60}m {item.duration % 60}s',
                'calories': item.calories,
                'form_score': item.form_score,
                'feedback': item.notes,
            }
            for item in self._items
        ]
        try:
            with open(self.path, 'w', encoding='utf-8') as handle:
                json.dump(payload, handle, indent=2)
        except OSError:
            pass

    def recent(self, limit):
        return sorted(self._items, key=lambda item: item.date, reverse=True)[:limit]

    def since(self, start):
        return [item for item in self._items if item.date >= start]

    def weekdays_since(self, start):
        return sorted({item.date.weekday() for item in self.since(start)})

    def totals(self):
        items = self._items
        sessions = len(items)
        duration = sum(item.duration for item in items)
        return {
            'workouts': sessions,
            'reps': sum(item.reps for item in items),
            'calories': round(sum(item.calories for item in items), 1),
            'avg_form_score': round(sum(item.form_score for item in items) / sessions, 1) if sessions else 0,
            'duration_seconds': duration,
            'duration_str': f'{duration // 60}m {duration % 60}s',
        }

    def breakdown(self):
        buckets = {}
        for item in self._items:
            bucket = buckets.setdefault(item.exercise_type, {'reps': 0, 'calories': 0.0, 'sessions': 0, 'form': 0})
            bucket['reps'] += item.reps
            bucket['calories'] += item.calories
            bucket['sessions'] += 1
            bucket['form'] += item.form_score
        ordered = sorted(buckets.items(), key=lambda pair: (-pair[1]['sessions'], pair[0]))
        return [
            {
                'name': key.replace('_', ' ').title(),
                'reps': value['reps'],
                'calories': round(value['calories'], 1),
                'sessions': value['sessions'],
                'form_score': round(value['form'] / value['sessions'], 1),
            }
            for key, value in ordered
        ]

    def monthly(self, year, month):
        totals = {}
        for item in self._items:
            if item.date.year == year and item.date.month == month:
                day = totals.setdefault(item.date.day, {'sessions': 0, 'reps': 0, 'calories': 0.0})
                day['sessions'] += 1
                day['reps'] += item.reps
                day['calories'] += item.calories
        return totals

    def weekly_progress(self, days=7):
        start = (datetime.now() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
        buckets = {}
        for item in self.since(start):
            key = item.date.date()
            bucket = buckets.setdefault(key, {'workouts': 0, 'calories': 0.0})
            bucket['workouts'] += 1
            bucket['calories'] += item.calories
        dates = sorted(buckets)
        return {
            'dates': [value.isoformat() for value in dates],
            'workouts': [buckets[value]['workouts'] for value in dates],
            'calories': [round(buckets[value]['calories'], 1) for value in dates],
        }


HISTORY = HistoryStore()
