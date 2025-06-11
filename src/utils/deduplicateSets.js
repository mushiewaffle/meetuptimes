/**
 * Deduplicates sets from multiple schedule uploads by using a composite key
 * @param {Array} existingSets - Array of existing set objects
 * @param {Array} newSets - Array of new set objects to add
 * @returns {Array} - Combined array with duplicates removed
 */
const deduplicateSets = (existingSets = [], newSets = []) => {
  // Defensive programming - handle empty or invalid inputs
  const existing = Array.isArray(existingSets) ? existingSets : [];
  const newItems = Array.isArray(newSets) ? newSets : [];
  
  // If one array is empty, return the other
  if (existing.length === 0 && newItems.length === 0) return [];
  if (existing.length === 0) return newItems;
  if (newItems.length === 0) return existing;
  
  // For debugging
  console.log(`Deduplicating: ${existing.length} existing sets + ${newItems.length} new sets`);
  
  // Create a map with composite key to guarantee uniqueness
  const uniqueSets = new Map();
  
  // Process existing sets first
  for (const set of existing) {
    if (!set || typeof set !== 'object') continue;
    
    // Generate a unique key based on artist, stage, and hour
    const key = getUniqueKey(set);
    if (key) {
      uniqueSets.set(key, set);
    }
  }
  
  // Process new sets
  for (const set of newItems) {
    if (!set || typeof set !== 'object') continue;
    
    // Generate a unique key
    const key = getUniqueKey(set);
    if (key) {
      uniqueSets.set(key, set);
    }
  }
  
  // Get the unique values from the map
  const result = Array.from(uniqueSets.values());
  
  console.log(`After deduplication: ${result.length} unique sets`);
  return result;
};

/**
 * Creates a unique key for a set to identify duplicates
 * @param {Object} set - The set object
 * @returns {string|null} - A unique key or null if invalid set
 */
const getUniqueKey = (set) => {
  if (!set) return null;
  
  // Extract and normalize the artist name
  const artist = set.artist ? String(set.artist).toLowerCase().trim() : '';
  if (!artist) return null;
  
  // Extract and normalize the stage
  const stage = set.stage ? String(set.stage).toLowerCase().trim() : '';
  
  // Extract the exact time from the start time (hours AND minutes)
  let timeKey = '';
  if (set.start) {
    try {
      const date = new Date(set.start);
      if (!isNaN(date.getTime())) {
        // Use both hours and minutes for more precise deduplication
        const hours = date.getHours();
        const minutes = date.getMinutes();
        timeKey = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    } catch (e) {
      console.error('Error parsing date:', e);
    }
  }
  
  // Return a composite key that uniquely identifies this set with exact time
  return `${artist}|${stage}|${timeKey}`;
};

export default deduplicateSets;
