import React from 'react';
import { parseISO } from 'date-fns';

/**
 * Component for displaying a friend's details and their set schedule
 * @param {Object} props - Component props
 * @param {Object} props.friend - Friend object with name and sets array
 * @param {number} props.index - Index of the friend in the friends array
 * @param {Function} props.onRemove - Function to call when removing a friend
 */
const FriendCard = ({ friend, index, onRemove }) => {
  /**
   * Format date for display
   * @param {string} isoString - ISO date string
   * @returns {string} - Formatted time string (e.g., "8:30 PM")
   */
  const formatTime = (isoString) => {
    const date = parseISO(isoString);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    
    return `${hours}:${minutes} ${ampm}`;
  };

  return (
    <li className="bg-black bg-opacity-60 rounded-md p-3 border border-edc-purple">
      <div className="flex justify-between items-center">
        <span className="text-edc-pink font-bold">{friend.name}</span>
        <div className="flex space-x-2">
          <span className="text-edc-purple text-sm">{friend.sets.length} sets</span>
          <button
            onClick={() => onRemove(index)}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            Remove
          </button>
        </div>
      </div>
      
      {friend.sets.length > 0 && (
        <ul className="mt-2 ml-3">
          {friend.sets.map((set, setIdx) => (
            <li key={setIdx} className="text-sm text-white">
              {set.artist}: {formatTime(set.start)} - {formatTime(set.end)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export default FriendCard;
