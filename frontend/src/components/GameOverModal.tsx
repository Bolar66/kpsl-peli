import { motion, AnimatePresence } from 'framer-motion';

interface GameOverModalProps {
  winner: string | null;
  isHost: boolean;
  onReplay: () => void;
  onBackToLobby: () => void;
  onExit: () => void;
}

export default function GameOverModal({ winner, isHost, onReplay, onBackToLobby, onExit }: GameOverModalProps) {
  return (
    <AnimatePresence>
      {winner && (
        <motion.div
          className="game-over-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="game-over-modal"
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <h2 className="game-over-title">🏆 {winner} voitti pelin!</h2>
            {isHost ? (
              <div className="btn-row">
                <button className="btn btn-primary" onClick={onReplay}>Pelaa uudestaan</button>
                <button className="btn btn-secondary" onClick={onBackToLobby}>Takaisin lobbyyn</button>
                <button className="btn btn-secondary" onClick={onExit}>Exit game</button>
              </div>
            ) : (
              <div className="btn-row">
                <p className="round-label">Odotetaan hostin päätöstä...</p>
                <button className="btn btn-secondary" onClick={onExit}>Exit game</button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}