import React from 'react';
import { parseISO } from 'date-fns';

/**
 * Component for displaying a meetup time suggestion
 * @param {Object} props - Component props
 * @param {Object} props.meetup - Meetup object with time, friends, and landmark
 * @param {number} props.index - Index of the meetup in the meetups array
 * @param {number} props.totalFriends - Total number of friends
 */
const MeetupTimeCard = ({ meetup, index, totalFriends }) => {
  // Determine if this is an "all friends" meetup
  const isAllFriends = meetup.friends.length === totalFriends;

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
    <li 
      className={`p-4 border-2 rounded-md transition-all ${
        isAllFriends 
          ? 'border-edc-pink bg-gradient-to-r from-black to-edc-purple/10' 
          : 'border-edc-blue'
      } ${index === 0 ? 'animate-pulse' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-edc-pink font-bold text-lg">
            {formatTime(meetup.time.start)} - {formatTime(meetup.time.end)}
          </p>
          <div className="flex items-center mt-1">
            <span className="text-edc-blue font-medium mr-1">@</span>
            <span className="text-white font-medium">{meetup.landmark}</span>
          </div>
        </div>
        {isAllFriends && (
          <span className="bg-edc-pink text-black text-xs font-bold px-2 py-1 rounded-full">EVERYONE</span>
        )}
      </div>
      
      <div className="mt-3 pt-2 border-t border-edc-purple/30">
        <p className="text-sm text-white">
          <span className="text-edc-blue font-medium">Who:</span> {meetup.friends.join(', ')}
        </p>
      </div>
    </li>
  );
};

export default MeetupTimeCard;
