import React from 'react';
import festivalSchedule from '../data/festivalSchedule';

/**
 * A component for displaying and selecting landmarks at music festivals
 * Used to enhance the meetup selection process
 */
const LandmarkSelect = ({ selectedLandmark, onLandmarkChange }) => {
  // Get unique stages from the festival schedule
  const uniqueStages = [...new Set(festivalSchedule.map(item => item.stage))];
  
  return (
    <div className="mb-4">
      <label className="text-edc-blue text-sm mb-1 block">
        Preferred Meetup Location:
      </label>
      <select
        value={selectedLandmark}
        onChange={(e) => onLandmarkChange(e.target.value)}
        className="w-full p-2 bg-black border border-edc-purple rounded-md text-white focus:outline-none focus:ring-2 focus:ring-edc-pink"
      >
        <option value="">No Preference</option>
        {uniqueStages.map((stage, idx) => (
          <option key={idx} value={stage}>
            {stage}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LandmarkSelect;
