import { useState, useEffect, useRef } from 'react';
import { X, Target, Goal } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useDrill } from '../context/DrillContext';
import { useEvents } from '../context/EventContext';
import { GoalEnd } from '../types';

// SessionSetupModal preserved for future use
export function SessionSetupModal() {
  const { isSetupOpen, closeSetup, openSetup, createSession, sessions, activeSession } = useSession();
  const { isDrawingDrillArea, setIsDrawingDrillArea, pendingArea, setPendingArea, setDrawingForNewSession, setIsDrillActive } = useDrill();
  const { teamNames } = useEvents();

  const [name, setName] = useState('');
  const [drillType, setLocalDrillType] = useState('');
  const [team1Goal, setTeam1Goal] = useState<GoalEnd>('right');
  const [team2Goal, setTeam2Goal] = useState<GoalEnd>('left');
  const [areaChoice, setAreaChoice] = useState<'full' | 'drawn'>('full');
  const [shouldReopenAfterDraw, setShouldReopenAfterDraw] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Re-open modal after drawing completes
  useEffect(() => {
    if (shouldReopenAfterDraw && !isDrawingDrillArea && pendingArea) {
      openSetup();
      setAreaChoice('drawn');
      setShouldReopenAfterDraw(false);
    }
  }, [shouldReopenAfterDraw, isDrawingDrillArea, pendingArea, openSetup]);

  // Reset form when opening
  useEffect(() => {
    if (isSetupOpen) {
      setName(`Session ${sessions.length + 1}`);
      setLocalDrillType('');
      setTeam1Goal(activeSession?.team1Goal ?? 'right');
      setTeam2Goal(activeSession?.team2Goal ?? 'left');
      if (pendingArea) {
        setAreaChoice('drawn');
      } else {
        setAreaChoice('full');
      }
    }
  }, [isSetupOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isSetupOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const area = areaChoice === 'drawn' && pendingArea ? pendingArea : null;

    createSession({
      name: name.trim() || `Session ${sessions.length + 1}`,
      drillType: drillType.trim(),
      area,
      team1Goal,
      team2Goal,
    });

    setPendingArea(null);
    if (area) setIsDrillActive(true);
    closeSetup();
  };

  const handleDrawArea = () => {
    closeSetup();
    setPendingArea(null);
    setDrawingForNewSession(true);
    setIsDrawingDrillArea(true);
    setShouldReopenAfterDraw(true);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) closeSetup();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-orange-500" />
            Create New Session
          </h2>
          <button
            onClick={closeSetup}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Session name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Session Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Finishing Drill AM"
              className="w-full px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
              autoFocus
            />
          </div>

          {/* Drill type */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Drill Type
            </label>
            <input
              type="text"
              value={drillType}
              onChange={e => setLocalDrillType(e.target.value)}
              placeholder="e.g. Half-field 6v6"
              className="w-full px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Drill area */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Drill Area
            </label>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setAreaChoice('full'); setPendingArea(null); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    areaChoice === 'full'
                      ? 'bg-orange-500 text-white ring-1 ring-orange-500'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Full Field
                </button>
                <button
                  type="button"
                  onClick={handleDrawArea}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                    areaChoice === 'drawn'
                      ? 'bg-orange-500 text-white ring-1 ring-orange-500'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  Draw on Pitch
                </button>
              </div>
              {areaChoice === 'drawn' && pendingArea && (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="text-green-600 dark:text-green-400 font-medium">Area drawn:</span>
                  {pendingArea.width.toFixed(0)}% &times; {pendingArea.height.toFixed(0)}%
                  <button
                    type="button"
                    onClick={handleDrawArea}
                    className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800"
                  >
                    Re-draw
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Team goal assignments */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
              <Goal className="w-3.5 h-3.5" />
              Shooting Direction
            </label>
            <div className="flex flex-col gap-2">
              {/* Team 1 */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 min-w-[80px] truncate">{teamNames.team1}</span>
                <span className="text-[10px] text-gray-400">shoots at</span>
                <div className="flex gap-1 flex-1">
                  {(['left', 'right'] as GoalEnd[]).map(side => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => { setTeam1Goal(side); if (team2Goal === side) setTeam2Goal(side === 'left' ? 'right' : 'left'); }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        team1Goal === side
                          ? 'bg-blue-500 text-white ring-1 ring-blue-500'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {side === 'left' ? '← Left' : 'Right →'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Team 2 */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 min-w-[80px] truncate">{teamNames.team2}</span>
                <span className="text-[10px] text-gray-400">shoots at</span>
                <div className="flex gap-1 flex-1">
                  {(['left', 'right'] as GoalEnd[]).map(side => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => { setTeam2Goal(side); if (team1Goal === side) setTeam1Goal(side === 'left' ? 'right' : 'left'); }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        team2Goal === side
                          ? 'bg-orange-500 text-white ring-1 ring-orange-500'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {side === 'left' ? '← Left' : 'Right →'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Select which goal each team is attacking. Start X will be saved as distance to that goal.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="mt-2 w-full py-2.5 rounded-lg font-semibold text-sm bg-navy dark:bg-rose text-white hover:opacity-90 transition-opacity"
          >
            Create Session
          </button>
        </form>
      </div>
    </div>
  );
}
// ...existing code...
