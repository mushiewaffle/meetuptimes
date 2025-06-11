// Utility function to find shared gaps between schedules

/**
 * Find shared time gaps between multiple schedules with improved logic
 * @param {Array} schedules - Array of schedule objects with sets
 * @returns {Array} - Array of shared gap objects with start, end times and schedule information
 */
const findSharedGaps = (schedules) => {
  if (!schedules || schedules.length === 0) return [];
  
  // Create a unique identifier for each set
  const createSetId = (set) => {
    if (!set || !set.artist || !set.start) return null;
    const artist = set.artist.toLowerCase().trim();
    const stage = set.stage ? set.stage.toLowerCase().trim() : 'unknown';
    const date = new Date(set.start);
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    return `${artist}|${stage}|${timeStr}`;
  };
  
  // Find all sets across all schedules with proper tracking of exact duplicates
  const allSets = [];
  const setsByIdentifier = {}; // Track sets by their unique ID
  const setsBySchedule = {}; // Track which schedules have each unique set
  
  schedules.forEach(schedule => {
    if (schedule.sets && schedule.sets.length > 0) {
      schedule.sets.forEach(set => {
        const setId = createSetId(set);
        if (!setId) return;
        
        // Track which schedules have this exact set
        if (!setsByIdentifier[setId]) {
          setsByIdentifier[setId] = {
            ...set,
            scheduleNames: [schedule.name] // Start tracking schedules
          };
          allSets.push(setsByIdentifier[setId]);
        } else {
          // If this set already exists, just add this schedule to its list
          if (!setsByIdentifier[setId].scheduleNames.includes(schedule.name)) {
            setsByIdentifier[setId].scheduleNames.push(schedule.name);
          }
        }
        
        // Also track by schedule name for easier lookups
        if (!setsBySchedule[schedule.name]) {
          setsBySchedule[schedule.name] = [];
        }
        setsBySchedule[schedule.name].push(setId);
      });
    }
  });
  
  // Find sets that appear in at least 2 schedules (exact matches - same artist, stage, and time)
  const commonSets = allSets.filter(set => set.scheduleNames.length >= 2);
  
  console.log('Common sets:', commonSets.length);
  
  // Sort sets by start time
  commonSets.sort((a, b) => {
    if (!a.start || !b.start) return 0;
    return new Date(a.start) - new Date(b.start);
  });
  
  // Create meetup times specifically before common sets
  const meetupGaps = [];
  
  // Keep track of processed meetups to avoid duplicates
  const processedMeetups = new Set();
  
  // For each common set (exact matches across schedules), create a meetup time
  commonSets.forEach(set => {
    if (!set.start || !set.artist) return;
    
    // Use artist name for metadata and stage for location
    const stage = set.stage || 'Unknown Stage';
    const startTime = new Date(set.start);
    
    // Create a 15-minute meetup gap right before the set
    const meetupStart = new Date(startTime);
    meetupStart.setMinutes(meetupStart.getMinutes() - 15);
    
    // Create a unique key for this meetup using exact time
    const meetupKey = `${meetupStart.getTime()}-${startTime.getTime()}-${stage}`;
    
    if (processedMeetups.has(meetupKey)) {
      return; // Skip if we already processed this meetup
    }
    
    processedMeetups.add(meetupKey);
    
    // Get schedules that have this exact set
    // This ensures we're only including schedules with the exact same artist+stage+time
    const schedulesWithExactSet = set.scheduleNames;
    
    // Find all schedules that are available during this meetup time
    // but don't have this exact set (so they're free to meet)
    const availableSchedules = [];
    
    schedules.forEach(schedule => {
      // Skip schedules that have this exact set (they're part of schedulesWithExactSet)
      const setId = createSetId(set);
      const hasThisExactSet = setsBySchedule[schedule.name]?.includes(setId);
      
      // If this schedule doesn't have the exact set we're checking,
      // see if it's available during the meetup time
      if (!hasThisExactSet) {
        // Check if any sets in this schedule overlap with the meetup time
        const hasOverlap = schedule.sets.some(scheduleSet => {
          if (!scheduleSet.start) return false;
          
          const setStart = new Date(scheduleSet.start);
          const setDuration = 60 * 60 * 1000; // Assume 1 hour if no end time
          const setEnd = new Date(setStart.getTime() + setDuration);
          
          // Check if the meetup time overlaps with this set
          return (
            (meetupStart >= setStart && meetupStart < setEnd) || // meetup start during set
            (startTime > setStart && startTime <= setEnd)       // meetup end during set
          );
        });
        
        // If no overlap, this schedule is available for the meetup
        if (!hasOverlap) {
          availableSchedules.push(schedule.name);
        }
      }
    });
    
    // Only if there are at least 2 schedules involved (either with the set or available)
    const totalRelevantSchedules = [...new Set([...schedulesWithExactSet, ...availableSchedules])]; 
    
    if (totalRelevantSchedules.length >= 2) {
      meetupGaps.push({
        start: meetupStart,
        end: startTime,
        schedules: availableSchedules,  // Only include schedules that don't have this set
        isRecommended: true,
        beforeCommonArtist: set.artist,
        beforeStage: stage,
        commonSchedules: schedulesWithExactSet // Track which schedules share this exact set
      });
    }
  });
  
  // If we don't have enough meetup times from common artists,
  // find additional general gaps between schedules
  if (meetupGaps.length < 2) {
    // Find gaps for each schedule
    const scheduleGaps = [];
    
    schedules.forEach(schedule => {
      if (!schedule.sets || schedule.sets.length === 0) return;
      
      // Sort sets by start time
      const sortedSets = [...schedule.sets].sort((a, b) => {
        if (!a.start || !b.start) return 0;
        return new Date(a.start) - new Date(b.start);
      });
      
      // Find gaps between sets
      for (let i = 0; i < sortedSets.length - 1; i++) {
        const currentSet = sortedSets[i];
        const nextSet = sortedSets[i + 1];
        
        if (!currentSet.start || !nextSet.start) continue;
        
        const currentEnd = new Date(currentSet.start);
        // Calculate end time based on start time
        if (!currentEnd) continue;
        
        const nextStart = new Date(nextSet.start);
        
        // If there's a gap between sets
        if (nextStart > currentEnd) {
          scheduleGaps.push({
            scheduleName: schedule.name,
            start: currentEnd,
            end: nextStart,
            afterArtist: currentSet.artist,
            beforeArtist: nextSet.artist
          });
        }
      }
    });
    
    // Find overlapping gaps between schedules
    if (scheduleGaps.length > 0) {
      const comparedGaps = [];
      
      // Compare each gap with gaps from other schedules
      for (let i = 0; i < scheduleGaps.length; i++) {
        for (let j = i + 1; j < scheduleGaps.length; j++) {
          const gapA = scheduleGaps[i];
          const gapB = scheduleGaps[j];
          
          // Skip if both gaps are from the same schedule
          if (gapA.scheduleName === gapB.scheduleName) continue;
          
          // Find the overlapping portion of the two gaps
          const overlapStart = new Date(Math.max(gapA.start, gapB.start));
          const overlapEnd = new Date(Math.min(gapA.end, gapB.end));
          
          // If there's an overlap and it's at least 15 minutes
          if (overlapEnd > overlapStart && (overlapEnd - overlapStart) >= 15 * 60 * 1000) {
            comparedGaps.push({
              start: overlapStart,
              end: overlapEnd,
              schedules: [gapA.scheduleName, gapB.scheduleName]
            });
          }
        }
      }
      
      // Add these general gaps to the meetup gaps
      comparedGaps.forEach(gap => {
        // Check if this gap is also a good meetup time for common artists
        let bestCommonArtist = null;
        let bestCommonStage = null;
        let minTimeToCommonArtist = Infinity;
        
        commonSets.forEach(set => {
          if (!set.start) return;
          
          const setStart = new Date(set.start);
          
          // If this set starts after the gap
          if (setStart >= gap.end) {
            const timeToArtist = setStart - gap.end;
            
            // If this is the closest common artist after the gap
            if (timeToArtist < minTimeToCommonArtist) {
              minTimeToCommonArtist = timeToArtist;
              bestCommonArtist = set.artist;
              bestCommonStage = set.stage;
            }
          }
        });
        
        // Limit gap duration to max 60 minutes for reasonability
        if ((gap.end - gap.start) > 60 * 60 * 1000) {
          const newStart = new Date(gap.end);
          newStart.setHours(newStart.getHours() - 1);
          gap.start = newStart;
        }
        
        meetupGaps.push({
          ...gap,
          isRecommended: false,
          beforeCommonArtist: bestCommonArtist,
          beforeStage: bestCommonStage
        });
      });
    }
  }
  
  // Helper function to adjust time for festival sorting (8am as starting point)
  const getAdjustedSortTime = (date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Calculate hours offset from 8am (0-23 hours scale)
    // Hours 8-23 come first (0-15), then hours 0-7 (16-23)
    const adjustedHours = (hours >= 8) ? hours - 8 : hours + 16;
    
    // Return a comparable value (hours * 60 + minutes) for easy sorting
    return adjustedHours * 60 + minutes;
  };

  // Sort meetups: recommended first, then by adjusted time starting from 8am
  meetupGaps.sort((a, b) => {
    if (a.isRecommended !== b.isRecommended) {
      return a.isRecommended ? -1 : 1;
    }
    
    // Sort by festival time (8am as starting point)
    const timeA = getAdjustedSortTime(new Date(a.start));
    const timeB = getAdjustedSortTime(new Date(b.start));
    return timeA - timeB;
  });
  
  // Limit to a reasonable number of meetup options
  return meetupGaps.slice(0, 8);
};

export default findSharedGaps;
