import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const EXERCISE = 'squat';
const REP_GOAL = 15;
const HISTORY_POINTS = 15;

type RepRecord = { rep: number; score: number };

function emptyHistory(value: number) {
  return Array.from({ length: HISTORY_POINTS }, () => ({ val: value }));
}

function calculateAngle(a: any, b: any, c: any) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formLabel(score: number) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Needs work';
  return 'Fix form';
}

export default function App() {
  const [reps, setReps] = useState(0);
  const [stage, setStage] = useState('Ready');
  const [formScore, setFormScore] = useState(100);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [depthAngle, setDepthAngle] = useState(180);
  const [torsoAngle, setTorsoAngle] = useState(90);
  const [depthHistory, setDepthHistory] = useState(emptyHistory(180));
  const [torsoHistory, setTorsoHistory] = useState(emptyHistory(90));
  const [repHistory, setRepHistory] = useState<RepRecord[]>([]);
  const [resetToken, setResetToken] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setDuration((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [paused]);

  const reset = () => {
    setReps(0);
    setStage('Ready');
    setFormScore(100);
    setDuration(0);
    setDepthAngle(180);
    setTorsoAngle(90);
    setDepthHistory(emptyHistory(180));
    setTorsoHistory(emptyHistory(90));
    setRepHistory([]);
    setResetToken((prev) => prev + 1);
  };

  const finish = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (reps === 0) {
        window.location.href = '/dashboard';
        return;
      }
      const response = await fetch('/api/add_workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercise: EXERCISE,
          reps,
          duration,
          calories: Number((reps * 0.5).toFixed(2)),
          form_score: Math.round(formScore),
          notes: 'Logged via React UI',
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Save failed (${response.status})`);
      }
      window.location.href = '/dashboard';
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save workout');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-4 md:p-6 flex flex-col md:flex-row gap-6 font-sans">
      <VideoPanel
        reps={reps}
        setReps={setReps}
        stage={stage}
        setStage={setStage}
        paused={paused}
        setPaused={setPaused}
        resetToken={resetToken}
        reset={reset}
        cameraError={cameraError}
        setCameraError={setCameraError}
        setFormScore={setFormScore}
        setDepthAngle={setDepthAngle}
        setTorsoAngle={setTorsoAngle}
        setDepthHistory={setDepthHistory}
        setTorsoHistory={setTorsoHistory}
        setRepHistory={setRepHistory}
        finish={finish}
        saving={saving}
        saveError={saveError}
      />
      <StatsPanel
        reps={reps}
        formScore={formScore}
        duration={duration}
        depthAngle={depthAngle}
        torsoAngle={torsoAngle}
        depthHistory={depthHistory}
        torsoHistory={torsoHistory}
        repHistory={repHistory}
      />
    </div>
  );
}

function VideoPanel({
  reps,
  setReps,
  stage,
  setStage,
  paused,
  setPaused,
  resetToken,
  reset,
  cameraError,
  setCameraError,
  setFormScore,
  setDepthAngle,
  setTorsoAngle,
  setDepthHistory,
  setTorsoHistory,
  setRepHistory,
  finish,
  saving,
  saveError,
}: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const counterRef = useRef(0);
  const stageRef = useRef<'up' | 'down'>('up');
  const scoresRef = useRef<number[]>([]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    counterRef.current = 0;
    stageRef.current = 'up';
    scoresRef.current = [];
  }, [resetToken]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    const canvasCtx = canvasElement.getContext('2d');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser cannot access a camera. Try Chrome or Safari over HTTPS.');
      return;
    }

    // @ts-ignore - MediaPipe Pose is loaded from the CDN in index.html
    const pose = new window.Pose({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 0,
      smoothLandmarks: true,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    pose.onResults((results: any) => {
      if (!canvasCtx) return;
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;

      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.translate(canvasElement.width, 0);
      canvasCtx.scale(-1, 1);
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

      if (results.poseLandmarks) {
        // @ts-ignore
        window.drawConnectors(canvasCtx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: '#00f2ff', lineWidth: 4 });
        // @ts-ignore
        window.drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#ff00f7', lineWidth: 2, radius: 4 });
        canvasCtx.restore();

        const landmarks = results.poseLandmarks;
        const hip = landmarks[23];
        const knee = landmarks[25];
        const ankle = landmarks[27];
        const shoulder = landmarks[11];

        if (hip && knee && ankle && shoulder) {
          const depth = calculateAngle(hip, knee, ankle);
          const torso = calculateAngle(shoulder, hip, { x: hip.x, y: 0 });

          setDepthAngle(Math.round(depth));
          setTorsoAngle(Math.round(torso));
          setDepthHistory((prev: any[]) => [...prev.slice(-(HISTORY_POINTS - 1)), { val: depth }]);
          setTorsoHistory((prev: any[]) => [...prev.slice(-(HISTORY_POINTS - 1)), { val: torso }]);

          if (depth > 160) {
            stageRef.current = 'up';
            setStage('Up');
          }

          if (depth < 90 && stageRef.current === 'up') {
            stageRef.current = 'down';
            setStage('Down');
            counterRef.current += 1;

            const leanPenalty = Math.max(0, torso - 15) * 1.5;
            const score = Math.max(40, Math.round(100 - leanPenalty));
            scoresRef.current = [...scoresRef.current, score];
            const average = scoresRef.current.reduce((sum, value) => sum + value, 0) / scoresRef.current.length;

            setReps(counterRef.current);
            setFormScore(Math.round(average));
            setRepHistory((prev: RepRecord[]) => [{ rep: counterRef.current, score }, ...prev].slice(0, 5));
          }
        }
      } else {
        canvasCtx.restore();
      }
    });

    // @ts-ignore
    const camera = new window.Camera(videoElement, {
      onFrame: async () => {
        if (pausedRef.current) return;
        await pose.send({ image: videoElement });
      },
      width: 1280,
      height: 720,
      facingMode: 'user',
    });

    setCameraError(null);
    camera.start().catch((error: Error) => {
      setCameraError(error.message || 'Could not start the camera.');
    });

    return () => {
      camera.stop();
      pose.close();
    };
  }, []);

  return (
    <div className="flex-1 bg-bg-panel rounded-2xl overflow-hidden border border-bg-panel-light relative min-h-[400px] md:min-h-[600px] shadow-lg flex flex-col">
      <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-center z-20">
        <div className="absolute top-0 left-0 h-1 bg-bg-panel-light w-full">
          <div className="h-full bg-accent-cyan transition-all duration-300" style={{ width: `${Math.min((reps / REP_GOAL) * 100, 100)}%` }}></div>
        </div>
        <span className="text-lg font-medium tracking-wide mt-2 drop-shadow-md">
          Barbell Squat (Rep {reps}/{REP_GOAL})
        </span>
        <div className="bg-red-500/20 text-red-500 px-3 py-1 flex items-center gap-2 rounded-md font-medium text-sm mt-2 border border-red-500/30">
          {paused ? 'PAUSED' : 'LIVE'}
          <div className={`w-2 h-2 rounded-full bg-red-500 ${paused ? '' : 'animate-pulse'}`}></div>
        </div>
      </div>

      <div className="relative flex-1 bg-black overflow-hidden group">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover hidden"></video>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover"></canvas>

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center p-8 bg-black/80 text-center z-30">
            <div className="max-w-sm">
              <p className="text-red-400 font-semibold mb-2">Camera unavailable</p>
              <p className="text-sm text-text-secondary">{cameraError}</p>
            </div>
          </div>
        )}

        <div className="absolute bottom-20 md:bottom-24 right-4 md:right-8 w-[calc(100%-2rem)] max-w-sm md:w-72 bg-bg-panel/90 backdrop-blur-md rounded-xl p-3 md:p-4 border border-bg-panel-light shadow-2xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop"
                alt="Coach Nova"
                className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-accent-cyan object-cover"
              />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 md:w-3.5 md:h-3.5 bg-accent-cyan rounded-full border-2 border-bg-panel"></div>
            </div>
            <div>
              <h4 className="text-xs md:text-sm font-bold tracking-wide uppercase">Coach Nova</h4>
            </div>
          </div>
          <div className="bg-bg-panel-light/50 rounded-lg p-2 md:p-3 text-xs md:text-sm text-text-secondary leading-relaxed border border-white/5">
            <span className="text-accent-green font-medium">Nova:</span> Current stage:{' '}
            <span className="text-accent-magenta font-bold">{stage}</span>
          </div>
        </div>

        <div className="absolute bottom-4 md:bottom-8 left-4 md:left-8 flex items-center gap-2 md:gap-4 flex-wrap">
          <div className="flex bg-bg-panel/80 backdrop-blur-md border border-bg-panel-light rounded-full p-1 md:p-2 shadow-xl">
            <button
              onClick={() => setPaused((prev: boolean) => !prev)}
              aria-label={paused ? 'Resume workout' : 'Pause workout'}
              className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-bg-panel-light rounded-full transition-colors"
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              onClick={reset}
              aria-label="Reset workout"
              className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-bg-panel-light rounded-full transition-colors"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <button
            onClick={finish}
            disabled={saving}
            className="px-3 md:px-4 py-2 text-xs md:text-base bg-accent-pink text-white font-bold rounded-lg shadow-[0_0_15px_rgba(255,0,247,0.4)] hover:bg-white hover:text-black transition-colors flex items-center gap-2 cursor-pointer border-none disabled:opacity-60"
          >
            <span>{saving ? 'SAVING…' : 'FINISH WORKOUT'}</span>
          </button>
          {saveError && <span className="text-xs text-red-400">{saveError}</span>}
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ reps, formScore, duration, depthAngle, torsoAngle, depthHistory, torsoHistory, repHistory }: any) {
  return (
    <div className="w-full md:w-[380px] lg:w-[420px] flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-4">
      <RepsOverviewCard reps={reps} formScore={formScore} duration={duration} />
      <BiomechanicsCard
        depthAngle={depthAngle}
        torsoAngle={torsoAngle}
        depthHistory={depthHistory}
        torsoHistory={torsoHistory}
        repHistory={repHistory}
        reps={reps}
      />
      <LiveTrackingCard repHistory={repHistory} />
    </div>
  );
}

function RepsOverviewCard({ reps, formScore, duration }: any) {
  const dashoffset = 283 - Math.min(1, reps / REP_GOAL) * 283;
  return (
    <div className="bg-bg-panel rounded-2xl border border-bg-panel-light p-6 shadow-md flex flex-col sm:flex-row gap-6">
      <div className="flex-1 flex flex-col items-center justify-center relative">
        <h3 className="text-text-secondary text-xs font-bold tracking-wider mb-2 absolute top-0 left-0 uppercase">Reps</h3>
        <div className="relative w-36 h-36 mt-4 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-bg-panel-light)" strokeWidth="6" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="var(--color-accent-cyan)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="283"
              strokeDashoffset={dashoffset}
              className="drop-shadow-lg filter transition-all duration-300 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-mono font-bold text-accent-cyan drop-shadow-[0_0_8px_rgba(0,245,255,0.4)]">{reps}</span>
            <span className="text-sm font-mono text-text-secondary">/{REP_GOAL}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-bg-panel-light/30 rounded-xl p-4 border border-white/5 flex flex-col h-full justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-accent-green/10 blur-xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          <h3 className="text-text-secondary text-xs tracking-wider uppercase mb-1">Form</h3>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-mono font-bold text-accent-green">
              {formScore}
              <span className="text-lg">%</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider bg-accent-green/20 text-accent-green px-1.5 py-0.5 rounded-sm">{formLabel(formScore)}</span>
          </div>
          <p className="text-xs text-text-secondary leading-snug">Torso lean and squat depth across completed reps</p>
        </div>

        <div className="bg-bg-panel-light/30 rounded-xl p-4 border border-white/5 flex flex-col justify-center">
          <h3 className="text-text-secondary text-xs tracking-wider uppercase mb-1">Time</h3>
          <span className="text-2xl font-mono font-semibold tracking-wide text-white">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

function BiomechanicsCard({ depthAngle, torsoAngle, depthHistory, torsoHistory, repHistory, reps }: any) {
  const depthPercent = Math.min(100, Math.max(0, Math.round(((180 - depthAngle) / 90) * 100)));
  const lastScore = repHistory[0]?.score ?? 0;
  const average = repHistory.length
    ? Math.round(repHistory.reduce((sum: number, item: RepRecord) => sum + item.score, 0) / repHistory.length)
    : 0;

  return (
    <div className="bg-bg-panel rounded-2xl border border-bg-panel-light p-6 shadow-md flex flex-col gap-4">
      <div className="flex justify-between items-center pb-2 border-b border-bg-panel-light">
        <h3 className="text-sm font-semibold tracking-wider uppercase text-white">Biomechanics Feedback</h3>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
        <div className="flex flex-col">
          <h4 className="text-[11px] text-text-secondary uppercase tracking-widest mb-2 font-medium">Squat Depth</h4>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-mono font-bold text-accent-green">
              {depthPercent}
              <span className="text-sm">%</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-text-secondary">{Math.round(depthAngle)}°</span>
          </div>
          <div className="h-12 w-full mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={depthHistory}>
                <Line type="monotone" dataKey="val" stroke="var(--color-accent-green)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col relative before:content-[''] before:absolute before:-left-3 before:h-full before:w-[1px] before:bg-bg-panel-light">
          <h4 className="text-[11px] text-text-secondary uppercase tracking-widest mb-2 font-medium">Last Rep Score</h4>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-mono font-bold text-accent-green">
              {lastScore || '—'}
              {lastScore ? <span className="text-sm">%</span> : null}
            </span>
            {lastScore ? <span className="text-[10px] uppercase tracking-wider text-text-secondary">{formLabel(lastScore)}</span> : null}
          </div>
          <div className="h-12 w-full mt-auto relative">
            <div className="absolute inset-x-0 top-1/2 w-full h-[1px] bg-white/10"></div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...repHistory].reverse()}>
                <Line type="monotone" dataKey="score" stroke="var(--color-accent-cyan)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-2 h-[1px] bg-bg-panel-light"></div>

        <div className="flex flex-col">
          <h4 className="text-[11px] text-text-secondary uppercase tracking-widest mb-2 font-medium">Torso Angle</h4>
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-2xl font-mono font-bold ${torsoAngle > 30 ? 'text-yellow-500' : 'text-accent-green'}`}>{torsoAngle}°</span>
            <span className={`text-[10px] uppercase tracking-wider ${torsoAngle > 30 ? 'text-yellow-500' : 'text-accent-green'}`}>
              {torsoAngle > 30 ? 'Watch lean' : 'Upright'}
            </span>
          </div>
          <div className="h-12 w-full mt-auto relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={torsoHistory}>
                <Line type="monotone" dataKey="val" stroke="#eab308" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col relative before:content-[''] before:absolute before:-left-3 before:h-full before:w-[1px] before:bg-bg-panel-light">
          <h4 className="text-[11px] text-text-secondary uppercase tracking-widest mb-2 font-medium">Session Average</h4>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-mono font-bold text-white">{average ? `${average}%` : '—'}</span>
          </div>
          <p className="text-xs text-text-secondary mb-4">
            {reps} rep{reps === 1 ? '' : 's'} scored this session
          </p>
        </div>
      </div>
    </div>
  );
}

function LiveTrackingCard({ repHistory }: any) {
  const displayReps: Array<RepRecord | null> = [...repHistory, ...Array(5).fill(null)].slice(0, 5);

  return (
    <div className="bg-bg-panel rounded-2xl border border-bg-panel-light p-6 shadow-md flex flex-col pb-8">
      <div className="flex justify-between items-center pb-4 mb-4 border-b border-bg-panel-light">
        <h3 className="text-sm font-semibold tracking-wider uppercase text-white">Live Pose Tracking</h3>
      </div>

      <div className="grid grid-cols-6 gap-2 w-full mt-2 relative">
        <div className="flex flex-col justify-end gap-6 text-[10px] text-text-secondary font-mono uppercase tracking-widest text-right pr-2">
          <span>Form</span>
          <span>Reps</span>
        </div>

        {displayReps.map((record, index) => (
          <div key={index} className="flex flex-col items-center gap-6 relative group">
            <div className="absolute top-0 bottom-[10px] w-8 border border-white/5 rounded-t-full bg-white/[0.02]"></div>

            <div className="h-16 flex items-end justify-center w-full relative z-10 pt-2">
              {record && (
                <>
                  <span
                    className={`text-lg font-mono font-bold ${
                      record.score < 75 ? 'text-text-secondary' : 'text-accent-green drop-shadow-[0_0_5px_rgba(0,255,102,0.3)]'
                    }`}
                  >
                    {record.score}
                  </span>
                  <div
                    className={`absolute -top-1 w-2 h-2 rounded-full ${
                      record.score < 75 ? 'bg-text-secondary' : 'bg-accent-green shadow-[0_0_8px_rgba(0,255,102,1)]'
                    }`}
                  ></div>
                </>
              )}
            </div>

            <span className="text-sm font-mono text-text-secondary z-10">{record ? record.rep : '—'}</span>

            {index < 4 && (
              <svg className="absolute left-1/2 top-0 w-full h-8 overflow-visible pointer-events-none stroke-accent-green/50 opacity-50 z-0">
                <line x1="0" y1="0" x2="100%" y2="4" strokeWidth="1.5" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
