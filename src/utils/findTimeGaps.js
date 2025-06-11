/**
 * Find all continuous time gaps between sets in a schedule
 * @param {Array} sets - Array of set objects with start times
 * @returns {Array} - Array of gap objects with start and end times
 */
const findTimeGaps = (sets) => {
  if (!sets || sets.length === 0) return [];
  
  // Sort sets by start time
  const sortedSets = [...sets].sort((a, b) => {
    try {
      return new Date(a.start) - new Date(b.start);
    } catch (e) {
      return 0;
    }
  });
  
  // Create time ranges for each set (assuming 1 hour duration)
  const timeRanges = sortedSets.map(set => {
    try {
      const startTime = new Date(set.start);
      const endTime = new Date(set.start);
      endTime.setHours(endTime.getHours() + 1);
      
      return {
        artist: set.artist,
        stage: set.stage,
        start: startTime,
        end: endTime
      };
    } catch (e) {
      console.error('Error creating time range:', e);
      return null;
    }
  }).filter(Boolean);
  
  if (timeRanges.length === 0) return [];
  
  // Find gaps between sets
  const gaps = [];
  
  // Consider festival day timeframe (12pm to 6am next day)
  const festivalStart = new Date();
  festivalStart.setHours(12, 0, 0, 0);
  
  const festivalEnd = new Date();
  festivalEnd.setDate(festivalEnd.getDate() + 1);
  festivalEnd.setHours(6, 0, 0, 0);
  
  // Add gap from festival start to first set if needed
  if (timeRanges[0].start > festivalStart) {
    gaps.push({
      start: festivalStart,
      end: timeRanges[0].start,
      beforeArtist: timeRanges[0].artist,
      beforeStage: timeRanges[0].stage
    });
  }
  
  // Add gaps between sets
  for (let i = 0; i < timeRanges.length - 1; i++) {
    const currentEnd = timeRanges[i].end;
    const nextStart = timeRanges[i + 1].start;
    
    if (nextStart > currentEnd) {
      gaps.push({
        start: currentEnd,
        end: nextStart,
        afterArtist: timeRanges[i].artist,
        beforeArtist: timeRanges[i + 1].artist,
        beforeStage: timeRanges[i + 1].stage
      });
    }
  }
  
  // Add gap from last set to festival end if needed
  const lastSet = timeRanges[timeRanges.length - 1];
  if (lastSet.end < festivalEnd) {
    gaps.push({
      start: lastSet.end,
      end: festivalEnd,
      afterArtist: lastSet.artist
    });
  }
  
  return gaps;
};

export default findTimeGaps;
