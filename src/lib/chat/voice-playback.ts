/** Native audio controls remain in charge; starting another voice pauses the previous one. */
let activePlayer: Pick<HTMLMediaElement, 'pause'> | null = null;

export function claimVoicePlayback(player: Pick<HTMLMediaElement, 'pause'>): void {
  const previous = activePlayer;
  activePlayer = player;
  if (previous && previous !== player) previous.pause();
}

export function releaseVoicePlayback(player: Pick<HTMLMediaElement, 'pause'>): void {
  if (activePlayer === player) activePlayer = null;
}
