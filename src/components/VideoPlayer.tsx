import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Upload, Volume2, VolumeX } from 'lucide-react';
import { useEvents } from '../context/EventContext';
import { formatTimestamp } from '../utils/formatters';

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [sourceType, setSourceType] = useState<'local' | 'youtube' | null>(null);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const { currentVideoTime, setCurrentVideoTime } = useEvents();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setIsPlaying(false);
      setSourceType('local');
    }
  };

  const handleYoutubeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setYoutubeUrl(e.target.value);
  };

  const handleYoutubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setVideoSrc(youtubeUrl);
    setSourceType('youtube');
    setIsPlaying(false);
  };

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentVideoTime(videoRef.current.currentTime);
    }
  }, [setCurrentVideoTime]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentVideoTime(time);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  useEffect(() => {
    if (sourceType === 'local') {
      const video = videoRef.current;
      if (video && videoSrc) {
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => setIsPlaying(false);

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('ended', onEnded);

        return () => {
          video.removeEventListener('timeupdate', handleTimeUpdate);
          video.removeEventListener('loadedmetadata', handleLoadedMetadata);
          video.removeEventListener('play', onPlay);
          video.removeEventListener('pause', onPause);
          video.removeEventListener('ended', onEnded);
        };
      }
    }
  }, [handleTimeUpdate, videoSrc, sourceType]);

  // When changing source type, reset videoSrc and youtubeUrl
  const handleSourceTypeSelect = (type: 'local' | 'youtube') => {
    setSourceType(type);
    setVideoSrc(null);
    setYoutubeUrl('');
    setIsPlaying(false);
    setDuration(0);
    setShowSourceMenu(false);
  };

  return (
    <div className="glass-card p-3 rounded-xl h-full flex flex-col">
      <div className="mb-2 flex gap-2 items-center relative">
        <button
          type="button"
          className="font-semibold text-sm cursor-pointer px-2 py-1 bg-transparent"
          onClick={() => setShowSourceMenu((prev) => !prev)}
        >
          Source
        </button>
        {showSourceMenu && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded shadow-lg flex flex-col min-w-[120px]">
            <button
              type="button"
              className="px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              onClick={() => handleSourceTypeSelect('local')}
            >
              Local File
            </button>
            <button
              type="button"
              className="px-4 py-2 text-left hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              onClick={() => handleSourceTypeSelect('youtube')}
            >
              YouTube Link
            </button>
          </div>
        )}
      </div>

      <div className="relative flex-1 bg-black/50 rounded-lg overflow-hidden mb-2 min-h-0">
        {sourceType === 'local' ? (
          !videoSrc ? (
            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-black/30 transition-colors">
              <Upload className="w-8 h-8 mb-1 text-gray-400" />
              <span className="text-gray-400 text-xs">Click to upload video</span>
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <video
              ref={videoRef}
              src={videoSrc}
              className="w-full h-full object-contain"
              onClick={togglePlay}
            />
          )
        ) : sourceType === 'youtube' ? (
          <form
            onSubmit={handleYoutubeSubmit}
            className="flex flex-col items-center justify-center w-full h-full gap-2"
          >
            <input
              type="text"
              placeholder="Paste YouTube link here"
              value={youtubeUrl}
              onChange={handleYoutubeChange}
              className="rounded px-2 py-1 border border-gray-300 bg-white dark:bg-gray-800 w-2/3 text-sm"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded bg-navy dark:bg-rose text-white font-semibold text-sm"
            >
              Load YouTube Video
            </button>
            {sourceType === 'youtube' && videoSrc && (
              <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                <iframe
                  width="100%"
                  height="100%"
                  src={getYoutubeEmbedUrl(videoSrc)}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full rounded-lg"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                />
              </div>
            )}
          </form>
        ) : (
          <div className="flex items-center justify-center w-full h-full text-gray-400 text-sm">Select a source to begin</div>
        )}
      </div>

      {/* Controls for local video only */}
      {sourceType === 'local' && videoSrc && (
        <div className="space-y-2">
          {/* Seek Bar */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentVideoTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-navy dark:accent-rose"
          />

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="p-1.5 rounded-full bg-navy dark:bg-rose hover:opacity-90 transition-opacity text-white"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                )}
              </button>
            </div>

            <div className="text-sm font-mono font-semibold text-navy dark:text-white">
              {formatTimestamp(currentVideoTime)} / {formatTimestamp(duration)}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Helper to convert YouTube URL to embed URL
  function getYoutubeEmbedUrl(url: string) {
    // Accepts full YouTube URLs and extracts the video ID
    const match = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/
    );
    const videoId = match ? match[1] : '';
    return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
  }
}
