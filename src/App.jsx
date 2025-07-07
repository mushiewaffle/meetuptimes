import React, { useState, useEffect, useRef } from 'react';
import { parseISO, format } from 'date-fns';
import html2canvas from 'html2canvas';
import './App.css';

// Components
import FestivalScheduleUploader from './components/FestivalScheduleUploader';
import VenmoTipJar from './components/VenmoTipJar';
// Import removed - no longer needed
import findSharedGaps from './utils/findSharedGaps';

// Add Capacitor imports for native filesystem support
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * Festival Meetup Times Planner App
 */
function App() {
  // Page navigation state - controls which page is currently shown
  // Values: 'main', 'meetupGaps', 'meetupPlan'
  const [currentPage, setCurrentPage] = useState('main');
  
  // State for storing schedules
  const [schedules, setSchedules] = useState([]);
  
  // No longer needed state variables have been removed
  
  // Function to handle showing the schedule options
  const handleShowScheduleOptions = () => {
    setShowScheduleOptions(true);
    setShowAIParsingMode(false);
    setTableInput('');
    setTableErrorMessage('');
  };
  
  // Parse table input for AI parsing mode
  const parseTableInput = (input) => {
    if (!input.trim()) return [];
    
    const lines = input.trim().split('\n');
    const parsedSets = [];
    let columnIndices = { artist: 0, time: 1, stage: 2 };
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('---')) continue;
      
      // Split by pipe and clean up each cell
      const columns = line.split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0);
      
      // Check if this is a header row
      if (i <= 1 && (line.includes('Artist') || line.includes('Time') || line.includes('Stage'))) {
        // Determine column positions based on header
        for (let j = 0; j < columns.length; j++) {
          const header = columns[j].toLowerCase();
          if (header.includes('artist') || header.includes('dj') || header.includes('performer')) {
            columnIndices.artist = j;
          } else if (header.includes('time') || header.includes('start')) {
            columnIndices.time = j;
          } else if (header.includes('stage') || header.includes('location')) {
            columnIndices.stage = j;
          }
        }
        continue;
      }
      
      // Process data rows
      if (columns.length >= 3) {
        const artist = columns[columnIndices.artist];
        const timeStr = columns[columnIndices.time];
        const stage = columns[columnIndices.stage];
        
        const time = convertToTimeFormat(timeStr);
        
        if (time && artist && stage) {
          parsedSets.push({
            time,
            artist,
            stage
          });
        }
      }
    }
    
    return parsedSets;
  };
  
  // Convert various time formats to a standard format
  const convertToTimeFormat = (timeStr) => {
    if (!timeStr) return null;
    
    // Try to extract time using regex
    const timeRegex = /(\d{1,2})(?::|\.)?(\d{2})\s*(am|pm|a\.m\.|p\.m\.|AM|PM|A\.M\.|P\.M\.)?/i;
    const match = timeStr.match(timeRegex);
    
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3] ? match[3].toLowerCase() : null;
      
      // Handle AM/PM
      if (period && (period.includes('p') || period.includes('pm'))) {
        if (hours < 12) hours += 12;
      } else if (period && (period.includes('a') || period.includes('am'))) {
        if (hours === 12) hours = 0;
      } else if (!period && hours < 12 && timeStr.toLowerCase().includes('p')) {
        // If no explicit AM/PM but 'p' is in the string, assume PM
        hours += 12;
      }
      
      // Format as HH:MM
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    return null;
  };
  
  // Process table input and create a new schedule
  const processTableInput = () => {
    if (!tableInput.trim()) return;
    
    setTableErrorMessage('');
    setIsProcessingTable(true);
    
    try {
      const parsedSets = parseTableInput(tableInput);
      
      if (parsedSets.length === 0) {
        setTableErrorMessage('No valid sets found in the table. Please check the format and make sure it includes Artist, Time, and Stage columns.');
        setIsProcessingTable(false);
        return;
      }
      
      // Convert to the format expected by the schedule (with ISO date strings)
      const formattedSets = parsedSets.map(set => {
        const [hours, minutes] = set.time.split(':').map(Number);
        const today = new Date();
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        
        return {
          artist: set.artist,
          stage: set.stage,
          start: date.toISOString()
        };
      });
      
      // Create a new schedule with the parsed sets
      const newSchedule = {
        name: `Schedule ${schedules.length + 1}`,
        sets: formattedSets
      };
      
      // Add the new schedule to the list
      setSchedules([newSchedule, ...schedules]);
      
      // Reset state
      setShowScheduleOptions(false);
      setShowAIParsingMode(false);
      setTableInput('');
      setIsProcessingTable(false);
      
      // No longer automatically edit the schedule name
      
    } catch (error) {
      console.error('Error processing table input:', error);
      setTableErrorMessage('Error parsing the table. Please check the format and try again.');
      setIsProcessingTable(false);
    }
  };
  
  // State for showing schedule creation options
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);
  const [showAIParsingMode, setShowAIParsingMode] = useState(false);
  const [showGPTSubscriptionOptions, setShowGPTSubscriptionOptions] = useState(false);
  const [hasGPTSubscription, setHasGPTSubscription] = useState(null); // null = not answered, true = has subscription, false = no subscription
  const [tableInput, setTableInput] = useState('');
  const [tableErrorMessage, setTableErrorMessage] = useState('');
  const [isProcessingTable, setIsProcessingTable] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  
  // State for meetup time gaps
  const [meetupGaps, setMeetupGaps] = useState([]);
  
  // State for selected meetup gaps
  const [selectedGaps, setSelectedGaps] = useState({});
  
  // State for finalized meetup plan
  const [meetupPlan, setMeetupPlan] = useState([]);
  
  // State for tracking which meetup's location is being edited
  const [editingLocationIndex, setEditingLocationIndex] = useState(null);
  const [editingLocation, setEditingLocation] = useState('');
  
  // These variables have been removed as they're no longer needed
  
  // Show/hide instructions
  const [showInstructions, setShowInstructions] = useState(false);
  
  // These variables have been removed as they're no longer needed
  
  // Handle clicking outside the instructions popup
  useEffect(() => {
    if (showInstructions) {
      const handleClickOutside = (event) => {
        if (event.target.closest('.instructions-popup') === null && 
            !event.target.closest('.help-button')) {
          setShowInstructions(false);
        }
      };
      
      const handleEscape = (event) => {
        if (event.key === 'Escape') {
          setShowInstructions(false);
        }
      };
      
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showInstructions]);
  
  // Track which schedules are expanded
  const [expandedSchedules, setExpandedSchedules] = useState({});
  
  // Form validation errors
  const [formErrors, setFormErrors] = useState({});
  
  // Refs for edit forms to handle click-away
  const editSetFormRef = useRef(null);
  const addSetFormRef = useRef(null);
  
  // Track which schedule is being edited (for name editing)
  const [editingScheduleIndex, setEditingScheduleIndex] = useState(null);
  const [editingScheduleName, setEditingScheduleName] = useState('');
  
  // State for editing sets within schedules
  const [editingSetInfo, setEditingSetInfo] = useState(null); // { scheduleIndex, setIndex, set }
  const [isAddingSetToSchedule, setIsAddingSetToSchedule] = useState(null); // scheduleIndex
  const [tempNewSetValues, setTempNewSetValues] = useState({
    artist: '',
    time: '',
    stage: ''
  });
  
  // Animation properties for fade-in transitions
  // (Animation handled through CSS classes instead)
  
  // Load saved data on initial render
  useEffect(() => {
    try {
      const savedSchedules = localStorage.getItem('festivalSchedules');
      const savedMeetups = localStorage.getItem('festivalMeetups');
      
      if (savedSchedules) {
        const parsedSchedules = JSON.parse(savedSchedules);
        setSchedules(parsedSchedules);
        
        // Counter is now calculated dynamically based on schedules.length
      }
      
      if (savedMeetups) {
        const parsedMeetups = JSON.parse(savedMeetups);
        setSelectedGaps(parsedMeetups.selectedGaps || {});
        setMeetupPlan(parsedMeetups.meetupPlan || []);
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
  }, []);
  
  // Listen for AI Parser direct schedule creation events
  useEffect(() => {
    const handleAddScheduleFromAI = (event) => {
      try {
        const { sets } = event.detail;
        
        if (!sets || sets.length === 0) {
          console.error('No sets provided from AI parser');
          return;
        }
        
        // Use default name (no AI indicator as requested)
        const scheduleName = `Schedule ${schedules.length + 1}`;
        
        // Add the schedule to the top of the list (consistent with other methods)
        setSchedules([{ name: scheduleName, sets }, ...schedules]);
        
        // Reset any found gaps as they're now outdated
        setMeetupGaps([]);
        setMeetupPlan([]);
        
        console.log(`Added schedule from AI parser: ${scheduleName} with ${sets.length} sets`);
      } catch (error) {
        console.error('Error handling AI schedule creation:', error);
      }
    };
    
    // Add event listener
    document.addEventListener('addScheduleFromAI', handleAddScheduleFromAI);
    
    // Clean up
    return () => {
      document.removeEventListener('addScheduleFromAI', handleAddScheduleFromAI);
    };
  }, [schedules]);
  
  // Save data when it changes
  useEffect(() => {
    try {
      if (schedules.length > 0) {
        localStorage.setItem('festivalSchedules', JSON.stringify(schedules));
      }
      
      if (Object.keys(selectedGaps).length > 0 || meetupPlan.length > 0) {
        localStorage.setItem('festivalMeetups', JSON.stringify({ 
          selectedGaps,
          meetupPlan 
        }));
      }
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [schedules, selectedGaps, meetupPlan]);
  
  // Handle click-away to cancel editing
  useEffect(() => {
    function handleClickOutside(event) {
      // Ignore clicks on toggle schedule expanded buttons
      if (event.target.closest('[data-action="toggle-schedule-expanded"]')) {
        return;
      }
      
      // For editing existing sets
      if (editingSetInfo && editSetFormRef.current && !editSetFormRef.current.contains(event.target)) {
        setEditingSetInfo(null);
        setFormErrors({});
      }
      
      // For adding new sets
      if (isAddingSetToSchedule !== null && addSetFormRef.current && !addSetFormRef.current.contains(event.target)) {
        // Check if clicked on any add set button
        const clickedOnAddButton = event.target.closest('[data-add-set-button]');
        if (!clickedOnAddButton) {
          setIsAddingSetToSchedule(null);
          setFormErrors({});
        }
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingSetInfo, isAddingSetToSchedule]);
  
  /**
   * Handle adding a new empty schedule directly from the All Schedules section
   * Immediately sets up name editing for better UX
   */
  const addEmptySchedule = () => {
    try {
      // Create an empty schedule with default name
      const scheduleName = `Schedule ${schedules.length + 1}`;
      
      // Create schedule object with properly initialized empty sets array
      const newSchedule = {
        name: scheduleName,
        sets: [] // Explicitly initialize as empty array
      };
      
      // Add new schedule at the top of the list
      const newSchedules = [newSchedule, ...schedules];
      setSchedules(newSchedules);
      
      // No longer automatically edit the schedule name
      
      console.log('Added empty schedule:', newSchedule);
      
      // Force a re-render to ensure React properly updates the DOM
      setTimeout(() => {
        const dummyUpdate = JSON.parse(JSON.stringify(newSchedules));
        setSchedules(dummyUpdate);
      }, 10);
    } catch (error) {
      console.error('Error adding empty schedule:', error);
    }
  };
  
  /**
   * Remove a schedule by index
   * @param {number} index - The index of the schedule to remove
   */
  const removeSchedule = (index) => {
    try {
      const updatedSchedules = [...schedules];
      updatedSchedules.splice(index, 1);
      setSchedules(updatedSchedules);
      
      // Reset gaps since they're now outdated
      setMeetupGaps([]);
      setMeetupPlan([]);
      
      // Reset to main page if we were on another page
      if (currentPage !== 'main') {
        setCurrentPage('main');
      }
    } catch (error) {
      console.error('Error removing schedule:', error);
    }
  };

  /**
   * Start editing a set within a schedule
   * @param {number} scheduleIndex - The index of the schedule
   * @param {number} setIndex - The index of the set within the schedule
   */
  const startEditingSet = (scheduleIndex, setIndex) => {
    const setToEdit = { ...schedules[scheduleIndex].sets[setIndex] };
    setEditingSetInfo({ scheduleIndex, setIndex, set: setToEdit });
    // Cancel any other editing operations
    setEditingScheduleIndex(null);
    setIsAddingSetToSchedule(null);
  };
  
  /**
   * Save changes to an edited set
   */
  const saveEditedSet = (updatedSet) => {
    if (!editingSetInfo) return;
    
    try {
      const { scheduleIndex, setIndex } = editingSetInfo;
      const updatedSchedules = [...schedules];
      updatedSchedules[scheduleIndex].sets[setIndex] = updatedSet;
      
      // Helper function to adjust time for sorting with 8am reset
      const getAdjustedSortTime = (dateStr) => {
        const date = new Date(dateStr);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        
        // Calculate hours offset from 8am (0-23 hours scale)
        // Hours 8-23 come first (0-15), then hours 0-7 (16-23)
        const adjustedHours = (hours >= 8) ? hours - 8 : hours + 16;
        
        // Return a comparable value (hours * 60 + minutes) for easy sorting
        return adjustedHours * 60 + minutes;
      };
      
      // Sort sets by start time with 8am as reset point
      updatedSchedules[scheduleIndex].sets.sort((a, b) => {
        return getAdjustedSortTime(a.start) - getAdjustedSortTime(b.start);
      });
      
      setSchedules(updatedSchedules);
      
      // Reset gaps since they're now outdated
      setMeetupGaps([]);
      setMeetupPlan([]);
      
      // Clear editing state
      setEditingSetInfo(null);
    } catch (error) {
      console.error('Error saving edited set:', error);
    }
  };
  
  const cancelEditingSet = () => {
    setEditingSetInfo(null);
    setFormErrors({});
  };

  /**
   * Delete a set from a schedule
   * @param {number} scheduleIndex - The index of the schedule
   * @param {number} setIndex - The index of the set to delete
   */
  const deleteSet = (scheduleIndex, setIndex) => {
    try {
      const updatedSchedules = [...schedules];
      updatedSchedules[scheduleIndex].sets.splice(setIndex, 1);
      setSchedules(updatedSchedules);
      
      // Reset gaps since they're now outdated
      setMeetupGaps([]);
      setMeetupPlan([]);
    } catch (error) {
      console.error('Error deleting set:', error);
    }
  };

  /**
   * Add a new set to an existing schedule
   * @param {Object} newSet - The new set to add
   */
  const addSetToSchedule = (newSet) => {
    if (isAddingSetToSchedule === null) return;
    
    try {
      console.log('Adding set to schedule index:', isAddingSetToSchedule);
      console.log('New set data:', newSet);
      
      // Create a completely new copy of schedules to avoid reference issues
      const updatedSchedules = JSON.parse(JSON.stringify(schedules));
      
      // Ensure the schedule exists
      if (!updatedSchedules[isAddingSetToSchedule]) {
        console.error('Schedule not found at index:', isAddingSetToSchedule);
        return;
      }
      
      // Always initialize sets as an array, even if it already exists
      if (!Array.isArray(updatedSchedules[isAddingSetToSchedule].sets)) {
        console.log('Initializing sets array for schedule');
        updatedSchedules[isAddingSetToSchedule].sets = [];
      }
      
      // Add the new set
      updatedSchedules[isAddingSetToSchedule].sets.push(newSet);
      console.log('Set added successfully');
      
      // Helper function to adjust time for sorting with 8am reset
      const getAdjustedSortTime = (dateStr) => {
        const date = new Date(dateStr);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        
        // Calculate hours offset from 8am (0-23 hours scale)
        // Hours 8-23 come first (0-15), then hours 0-7 (16-23)
        const adjustedHours = (hours >= 8) ? hours - 8 : hours + 16;
        
        // Return a comparable value (hours * 60 + minutes) for easy sorting
        return adjustedHours * 60 + minutes;
      };
      
      // Sort sets by start time with 8am as reset point
      if (updatedSchedules[isAddingSetToSchedule].sets.length > 1) {
        updatedSchedules[isAddingSetToSchedule].sets.sort((a, b) => {
          return getAdjustedSortTime(a.start) - getAdjustedSortTime(b.start);
        });
      }
      
      // Update state with the new schedules
      setSchedules(updatedSchedules);
      
      // Reset gaps since they're now outdated
      setMeetupGaps([]);
      setMeetupPlan([]);
      
      // Clear adding state
      setIsAddingSetToSchedule(null);
      setFormErrors({});
      
      console.log('Updated schedules:', updatedSchedules);
    } catch (error) {
      console.error('Error adding set to schedule:', error);
    }
  };

  /**
   * Cancel adding a set to a schedule
   */
  const cancelAddingSet = () => {
    setIsAddingSetToSchedule(null);
    setFormErrors({});
    setTempNewSetValues({
      artist: '',
      time: '',
      stage: ''
    });
  };
  
  /**
   * Toggle expanded state for a schedule
   * @param {number} index - The index of the schedule to toggle
   */
  const toggleScheduleExpanded = (index) => {
    setExpandedSchedules(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  /**
   * Find shared time gaps between schedules
   */
  const findMeetupGaps = () => {
    if (schedules.length < 2) {
      alert('Please add at least two schedules with set times before finding meetup gaps');
      return;
    }
    
    try {
      // Find all shared gaps
      const gaps = findSharedGaps(schedules);
      
      if (gaps.length === 0) {
        alert('No shared time gaps found between your schedules. Try adding more schedules or more sets.');
        return;
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

      // Sort gaps: recommended first, then by festival time (8am as starting point)
      gaps.sort((a, b) => {
        if (a.isRecommended !== b.isRecommended) {
          return a.isRecommended ? -1 : 1;
        }
        const timeA = getAdjustedSortTime(new Date(a.start));
        const timeB = getAdjustedSortTime(new Date(b.start));
        return timeA - timeB;
      });
      
      // Set the found gaps
      setMeetupGaps(gaps);
      
      // Reset selections and plan
      setSelectedGaps({});
      setMeetupPlan([]);
      
      console.log(`Found ${gaps.length} potential meetup gaps`);
      
      // Change to the meetup gaps page
      setCurrentPage('meetupGaps');
      
      // Scroll to top on page change
      window.scrollTo(0, 0);
    } catch (error) {
      console.error('Error finding meetup gaps:', error);
      alert('There was an error finding meetup times. Please try again.');
    }
  };
  
  /**
   * Toggle selection of a meetup gap
   * @param {number} index - The index of the gap to toggle
   */
  const toggleGapSelection = (index) => {
    setSelectedGaps(prev => {
      const newSelected = { ...prev };
      
      if (newSelected[index]) {
        delete newSelected[index];
      } else {
        newSelected[index] = true;
      }
      
      return newSelected;
    });
  };
  
  /**
   * Navigate back to a previous page
   * @param {string} targetPage - The page to navigate back to
   */
  const navigateBack = (targetPage) => {
    setCurrentPage(targetPage);
    // Scroll to top on page change
    window.scrollTo(0, 0);
  };
  
  /**
   * Start editing a schedule name
   * @param {number} index - The index of the schedule to edit
   */
  const startEditingScheduleName = (index) => {
    setEditingScheduleIndex(index);
    setEditingScheduleName(schedules[index].name);
  };
  
  /**
   * Save edited schedule name
   */
  const saveScheduleName = () => {
    if (editingScheduleIndex === null) return;
    
    try {
      const updatedSchedules = [...schedules];
      updatedSchedules[editingScheduleIndex].name = editingScheduleName.trim() || `Schedule ${editingScheduleIndex + 1}`;
      setSchedules(updatedSchedules);
      setEditingScheduleIndex(null);
      setEditingScheduleName('');
    } catch (error) {
      console.error('Error saving schedule name:', error);
      alert('There was an error saving the schedule name. Please try again.');
    }
  };
  
  /**
   * Cancel editing schedule name
   */
  const cancelEditingScheduleName = () => {
    setEditingScheduleIndex(null);
    setEditingScheduleName('');
  };
  
  /**
   * Save meetup plan as image
   */
  const meetupPlanRef = useRef(null);
  
  const saveMeetupPlanAsImage = () => {
    if (!meetupPlanRef.current) return;
    
    // Check if on mobile
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
    
    // If user is currently editing a meetup location, save it first and then continue
    if (editingLocationIndex !== null) {
      // Save the current edit
      saveLocation();
      
      // Wait for the DOM to update completely
      setTimeout(() => {
        // Ensure editing state is cleared
        setEditingLocationIndex(null);
        setEditingLocation('');
        
        // Continue with the image saving process
        processSaveImage(isMobile);
      }, 200);
      
      return;
    }
    
    // If not editing, proceed directly
    processSaveImage(isMobile);
  };
  
  // Helper function to handle the actual image capture logic
  const processSaveImage = (isMobile = false) => {
    let offscreenContainer;
    let saveButton;
    let originalText;
    try {
      // Create a new offscreen element (this won't be visible to the user)
      const offscreenElement = meetupPlanRef.current.cloneNode(true);
      
      // Apply screenshot styling to the clone (not the visible element)
      offscreenElement.classList.add('screenshot-mode');
      
      // Position the element offscreen but still render it
      offscreenContainer = document.createElement('div');
      offscreenContainer.style.position = 'absolute';
      offscreenContainer.style.left = '-9999px';
      offscreenContainer.style.top = '0';
      offscreenContainer.style.width = `${meetupPlanRef.current.offsetWidth}px`;
      offscreenContainer.appendChild(offscreenElement);
      document.body.appendChild(offscreenContainer);
      
      // Configure the html2canvas options
      // Make the offscreen container more narrow for a better fit in the image
      offscreenContainer.style.maxWidth = '600px';
      
      const options = {
        backgroundColor: '#121212',
        scale: window.innerWidth < 768 ? 2 : 3, // Higher scale on larger screens
        logging: false,
        allowTaint: true,
        useCORS: true,
        scrollX: 0,
        scrollY: 0, // No need to adjust scroll for offscreen element
        windowWidth: Math.min(600, window.innerWidth), // Reduce max width to make screenshot less wide
        windowHeight: window.innerHeight,
      };
      
      // Show a loading indicator while capturing
      saveButton = document.getElementById('save-image-button');
      originalText = saveButton.innerHTML;
      saveButton.disabled = true;
      saveButton.innerHTML = '<svg class="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Saving...';
      
      // Helper to download via data URL (silent download)
      const downloadDataUrl = (dataUrl, filename) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();
      };
      

      // Capture and handle saving
      html2canvas(offscreenElement, options)
        .then(canvas => {
          const date = new Date().toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }).replace(/\s/g,'-');
          const filename = `Festival-Meetup-Plan-${date}.png`;
          const dataUrl = canvas.toDataURL('image/png');
          canvas.toBlob(async blob => {
            if (Capacitor.isNativePlatform()) {
              // Native iOS/Android: write directly to Photos
              const reader = new FileReader();
              reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
                try {
                  await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Photos });
                  alert('Saved to Photos');
                } catch (err) {
                  console.error('Filesystem error:', err);
                  alert('Failed to save to Photos');
                }
              };
              reader.readAsDataURL(blob);
            } else {
              if (isMobile) {
                // Create a subtle, festival-styled overlay with a single button
                const overlay = document.createElement('div');
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
                overlay.style.zIndex = '9999';
                overlay.style.display = 'flex';
                overlay.style.flexDirection = 'column';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                document.body.appendChild(overlay);
                
                // Create clickable thumbnail preview
                const preview = document.createElement('img');
                preview.src = dataUrl;
                preview.style.width = '80%';
                preview.style.maxWidth = '350px';
                preview.style.borderRadius = '6px';
                preview.style.marginBottom = '10px';
                preview.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
                preview.style.cursor = 'pointer';
                
                // Add hint text
                const hint = document.createElement('p');
                hint.innerHTML = 'Press and hold image to save';
                hint.style.color = 'rgba(255, 255, 255, 0.7)';
                hint.style.fontSize = '14px';
                hint.style.marginTop = '12px';
                hint.style.textAlign = 'center';
                
                overlay.appendChild(preview);
                overlay.appendChild(hint);
                
                // Make the image directly saveable
                preview.style.webkitTouchCallout = 'default';
                preview.style.webkitUserSelect = 'auto';
                preview.style.khtmlUserSelect = 'auto';
                preview.style.mozUserSelect = 'auto';
                preview.style.msUserSelect = 'auto';
                preview.style.userSelect = 'auto';
                
                // Also add close option (subtle X in corner)
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '×';
                closeBtn.style.position = 'absolute';
                closeBtn.style.top = '10px';
                closeBtn.style.right = '10px';
                closeBtn.style.background = 'transparent';
                closeBtn.style.border = 'none';
                closeBtn.style.color = 'rgba(255, 255, 255, 0.7)';
                closeBtn.style.fontSize = '28px';
                closeBtn.style.cursor = 'pointer';
                closeBtn.style.width = '40px';
                closeBtn.style.height = '40px';
                closeBtn.style.display = 'flex';
                closeBtn.style.alignItems = 'center';
                closeBtn.style.justifyContent = 'center';
                closeBtn.style.padding = '0';
                overlay.appendChild(closeBtn);
                
                closeBtn.addEventListener('click', () => {
                  document.body.removeChild(overlay);
                });
              } else {
                // Desktop: silent download
                downloadDataUrl(dataUrl, filename);
              }
            }
            // Clean up UI
            document.body.removeChild(offscreenContainer);
            saveButton.disabled = false;
            saveButton.innerHTML = originalText;
          });
        })
        .catch(error => {
          console.error('Error capturing image:', error);
          alert('There was an error creating the screenshot. Please try again.');
          document.body.removeChild(offscreenContainer);
          saveButton.disabled = false;
          saveButton.innerHTML = originalText;
        });
    } catch (error) {
      console.error('Error capturing meetup plan:', error);
      alert('There was an error creating the screenshot. Please try again.');
      // Make sure the button is restored
      const saveButton = document.getElementById('save-image-button');
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 16v-4" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6" /></svg> Save as Image';
      }
    }
  };
  
  /**
   * Reset the entire app to initial state
   */
  const resetApp = () => {
    // Show confirmation dialog before resetting
    const confirmReset = window.confirm(
      "Are you sure you want to reset everything? This will delete all schedules and meetup plans."
    );
    
    if (!confirmReset) return;
    
    try {
      // Clear all state
      setSchedules([]);
      setMeetupGaps([]);
      setSelectedGaps({});
      setMeetupPlan([]);
      setExpandedSchedules({});
      setEditingScheduleIndex(null);
      setEditingScheduleName('');
      setEditingLocationIndex(null);
      setEditingLocation('');
      
      // Return to main page
      setCurrentPage('main');
      
      // Clear local storage
      localStorage.removeItem('festivalSchedules');
      localStorage.removeItem('festivalMeetups');
      
      // Scroll back to top
      window.scrollTo(0, 0);
      
      // Clear the uploader if it's present
      document.dispatchEvent(new CustomEvent('clearUploader'));
    } catch (error) {
      console.error('Error resetting app:', error);
      alert('There was an error resetting the app. Please try refreshing the page.');
    }
  };
  
  /**
   * Generate meetup times from selected gaps
   */
  const generateMeetups = () => {
    const selectedIndices = Object.keys(selectedGaps);
    
    if (selectedIndices.length === 0) {
      alert('Please select at least one meetup time gap first');
      return;
    }
    
    // Process selected gap indices
    
    try {
      // Create a meetup plan from the selected gaps
      const plan = selectedIndices.map(index => {
        const gap = meetupGaps[index];
        if (!gap) return null;
        
        // Simply use the gap's existing information without recalculating
        return {
          id: `meetup-${Date.now()}-${index}`,
          start: gap.start,
          end: gap.end,
          schedules: gap.commonSchedules || gap.schedules, // Use the same schedules shown in the Potential Meetup Times page
          beforeStage: gap.beforeStage,
          beforeCommonArtist: gap.beforeCommonArtist,
          isRecommended: gap.schedules.length === schedules.length,
          customLocation: '' // Initialize custom location field
        };
      })
      .filter(Boolean);
      
      // Sort by start time
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
      
      // Sort by festival time (8am as starting point)
      plan.sort((a, b) => {
        const timeA = getAdjustedSortTime(new Date(a.start));
        const timeB = getAdjustedSortTime(new Date(b.start));
        return timeA - timeB;
      });
      
      // Plan is now sorted and ready to be displayed
      
      // Update the meetup plan
      setMeetupPlan(plan);
      
      // Change to the meetup plan page
      setCurrentPage('meetupPlan');
      
      // Scroll to top on page change
      window.scrollTo(0, 0);
    } catch (error) {
      console.error('Error generating meetup plan:', error);
    }
  };
  
  /**
   * Format time for display in 12-hour format or 24-hour format
   * @param {string|Date} time - ISO string or Date object
   * @param {string} formatType - Optional format ('HH:mm' for 24-hour format)
   * @returns {string} - Formatted time string
   */
  const formatTime = (time, formatType) => {
    try {
      if (!time) return '--:-- --';
      const date = typeof time === 'string' ? parseISO(time) : time;
      if (isNaN(date.getTime())) return '--:-- --';
      
      if (formatType === 'HH:mm') {
        // 24-hour format for time input fields
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      }
      
      return format(date, 'h:mm a');
    } catch {
      // Silent error handling for better UX
      return '--:-- --';
    }
  };
  
  /**
   * Calculate and format a duration
   * @param {Date|string|number} start - Start time (Date object or ISO string) or minutes directly
   * @param {Date|string} [end] - End time (Date object or ISO string), optional
   * @returns {string} - Formatted duration
   */
  const formatDuration = (start, end) => {
    try {
      if (!start || !end) return '--';
      
      let diffMins;
      
      // If only one parameter and it's a number, it's already minutes
      if (typeof start === 'number' && end === undefined) {
        diffMins = start;
      } else {
        // Convert to Date objects if they're strings
        const startDate = typeof start === 'string' ? parseISO(start) : start;
        const endDate = typeof end === 'string' ? parseISO(end) : end;
        
        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '--';
        
        // Calculate difference in minutes
        const diffMs = endDate.getTime() - startDate.getTime();
        diffMins = Math.round(diffMs / 60000);
      }
      
      // Format the duration
      if (diffMins < 0) {
        return '--';
      } else if (diffMins < 60) {
        return `${diffMins} min`;
      } else {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
      }
    } catch {
      // Silent error handling for better UX
      return '--';
    }
  };
  
  /**
   * Start editing a meetup location
   * @param {number} index - The index of the meetup to edit
   */
  const startEditingLocation = (index) => {
    const meetup = meetupPlan[index];
    setEditingLocationIndex(index);
    setEditingLocation(meetup.customLocation || '');
  };
  
  /**
   * Save edited meetup location
   */
  const saveLocation = () => {
    if (editingLocationIndex === null) return;
    
    const updatedPlan = [...meetupPlan];
    updatedPlan[editingLocationIndex] = {
      ...updatedPlan[editingLocationIndex],
      customLocation: editingLocation.trim()
    };
    
    setMeetupPlan(updatedPlan);
    setEditingLocationIndex(null);
    setEditingLocation('');
  };
  
  /**
   * Cancel editing meetup location
   */
  const cancelEditingLocation = () => {
    setEditingLocationIndex(null);
    setEditingLocation('');
  };
  
  return (
    <div className="min-h-screen w-full bg-edc-black bg-festival-pattern bg-cover bg-center py-4 px-2 overflow-x-hidden">
      <div className="max-w-5xl mx-auto w-full">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-edc-blue to-edc-pink mb-2">
            Festival Meetup Times Planner
          </h1>
          <p className="text-edc-purple text-lg">
            Find the best times to meet up with friends between festival sets
          </p>
        </header>
        
        {/* Main page with schedule input and schedule list */}
        {currentPage === 'main' && (
          <div className="flex flex-col gap-6">
            <div className="w-full space-y-4">
            
            {/* Schedule list display */}
            {schedules.length > 0 && (
              <div className="mt-4">
                {/* Centered title with more prominence */}
                <div className="text-center mb-4">
                  <h3 className="text-2xl font-bold text-edc-blue bg-gradient-to-r from-edc-blue to-edc-pink bg-clip-text text-transparent inline-block">All Schedules</h3>
                </div>
                
                {/* Conditionally show either the Add Schedule button or the Schedule Creation Options */}
                {!showScheduleOptions ? (
                  <div className="flex justify-center mb-4">
                    <button
                      onClick={handleShowScheduleOptions}
                      className="w-full py-2.5 rounded-md text-white font-medium bg-edc-blue/40 hover:bg-edc-blue/60 transition-all duration-200 flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add a Schedule
                    </button>
                  </div>
                ) : (
                   <div className="border border-edc-purple/30 rounded-lg mb-4 overflow-hidden bg-black/30">
                     <div className="p-4">
                         {showGPTSubscriptionOptions ? (
                          <>
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-edc-pink font-medium">AI Set Parser</h4>
                              <div className="flex space-x-4">
                                <button 
                                  onClick={() => {
                                    setShowGPTSubscriptionOptions(false);
                                  }}
                                  className="text-edc-blue hover:text-blue-400 text-sm transition-colors"
                                >
                                  Back
                                </button>
                                <button 
                                  onClick={() => {
                                    setShowScheduleOptions(false);
                                    setShowGPTSubscriptionOptions(false);
                                    setHasGPTSubscription(null);
                                  }}
                                  className="text-edc-pink hover:text-red-500 text-sm transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                            
                            <div className="text-white/80 text-sm mb-4 text-center">
                              Do you have a ChatGPT Premium subscription?
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Has Premium Subscription */}
                              <button 
                                onClick={() => {
                                  setShowGPTSubscriptionOptions(false);
                                  setShowAIParsingMode(true);
                                  setHasGPTSubscription(true);
                                }}
                                className="bg-black/40 hover:bg-black/60 border border-edc-purple/30 hover:border-edc-purple/60 rounded-lg p-4 flex flex-col items-center transition-all"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-edc-blue mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-edc-blue font-medium">Yes, I have ChatGPT Premium</span>
                                <span className="text-white/60 text-xs mt-1">Use the Schedule Parser GPT</span>
                              </button>
                              
                              {/* No Premium Subscription */}
                              <button 
                                onClick={() => {
                                  setShowGPTSubscriptionOptions(false);
                                  setShowAIParsingMode(true);
                                  setHasGPTSubscription(false);
                                }}
                                className="bg-black/40 hover:bg-black/60 border border-edc-purple/30 hover:border-edc-purple/60 rounded-lg p-4 flex flex-col items-center transition-all"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-edc-pink mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-edc-pink font-medium">No, I don't have ChatGPT Premium</span>
                                <span className="text-white/60 text-xs mt-1">Use a copy-paste prompt instead</span>
                              </button>
                            </div>
                          </>
                         ) : !showAIParsingMode ? (
                        <>
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-edc-blue font-medium">Create a New Schedule</h4>
                            <button 
                              onClick={() => setShowScheduleOptions(false)}
                              className="text-edc-pink hover:text-red-500 text-sm transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Manual Entry Option */}
                            <button 
                              onClick={() => {
                                setShowScheduleOptions(false);
                                // Create a new empty schedule
                                addEmptySchedule();
                              }}
                              className="bg-black/40 hover:bg-black/60 border border-edc-purple/30 hover:border-edc-purple/60 rounded-lg p-4 flex flex-col items-center transition-all"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-edc-blue mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              <span className="text-edc-blue font-medium">Manual Entry</span>
                              <span className="text-white/60 text-xs mt-1">Create an empty schedule and add sets one by one</span>
                            </button>
                            
                            {/* AI Parsing Option */}
                            <button 
                              onClick={() => {
                                // Show GPT subscription options instead of AI parsing mode directly
                                setShowGPTSubscriptionOptions(true);
                                setHasGPTSubscription(null);
                              }}
                              className="bg-black/40 hover:bg-black/60 border border-edc-purple/30 hover:border-edc-purple/60 rounded-lg p-4 flex flex-col items-center transition-all"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-edc-pink mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                              </svg>
                              <span className="text-edc-pink font-medium">AI Parsing</span>
                              <span className="text-white/60 text-xs mt-1">Paste a table of set times to automatically parse</span>
                            </button>
                          </div>
                          
                          {/* Cancel button moved to top right */}
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="text-edc-pink font-medium">AI Set Parser</h4>
                            <div className="flex space-x-4">
                              <button 
                                onClick={() => {
                                  setShowAIParsingMode(false);
                                  setShowGPTSubscriptionOptions(true);
                                }}
                                className="text-edc-blue hover:text-blue-400 text-sm transition-colors"
                              >
                                Back
                              </button>
                              <button 
                                onClick={() => {
                                  setShowScheduleOptions(false);
                                  setShowGPTSubscriptionOptions(false);
                                  setShowAIParsingMode(false);
                                  setTableInput('');
                                  setTableErrorMessage('');
                                  setHasGPTSubscription(null);
                                }}
                                className="text-edc-pink hover:text-red-500 text-sm transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                                                    <div className="space-y-6">
                            {/* Content based on subscription status */}
                            <div className="flex flex-col space-y-3">
                              {hasGPTSubscription ? (
                                // Premium user - Show GPT button
                                <div className="flex flex-col space-y-3">
                                  <p className="text-white/80 text-xs">
                                    Upload your festival schedule screenshot(s) into custom GPT below
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <a 
                                      href="https://chatgpt.com/g/g-68655cca11a8819199c988aa0d95c3c4-music-festival-schedule-parser" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="bg-edc-purple/80 text-white px-4 py-2 rounded-md hover:bg-edc-purple transition-colors text-sm font-medium flex-1 text-center"
                                    >
                                      Open Schedule Parser GPT
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                // Non-premium user - Show prompt copy
                                <div className="relative space-y-3">
                                  <p className="text-white/80 text-xs">
                                    Copy + paste prompt with schedule screenshot(s) to AI of your choice
                                  </p>
                                  <div 
                                    className="bg-black/40 border border-edc-purple/30 rounded p-3 text-white/80 text-xs cursor-pointer hover:border-edc-pink/50 transition-colors"
                                    onClick={() => {
                                      navigator.clipboard.writeText(
                                        `I have a screenshot of a music festival schedule. Extract the information into a clean markdown table exactly in this order:\n\n| Artist | Start Time | Stage Name |\n|--------|------------|-------------|\n| [artist name] | [time] | [stage name] |\n\n- Only include entries clearly showing an artist name, start time, and stage name.\n- If the image doesn't clearly contain a readable festival schedule, reply exactly with: "I couldn't find a readable festival schedule in this image. Please upload a clearer screenshot."\n\nDo not add extra explanations—just provide the markdown table.`
                                      );
                                      // Show a temporary copied message
                                      setCopiedPrompt(true);
                                      setTimeout(() => setCopiedPrompt(false), 2000);
                                    }}
                                  >
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-medium text-edc-blue">Prompt to copy</span>
                                      <span className="text-edc-pink text-xs">{copiedPrompt ? 'Copied!' : 'Click to copy'}</span>
                                    </div>
                                    <div className="text-white/60 whitespace-pre-line text-xs">
                                      I have a screenshot of a music festival schedule. Extract the information into a clean markdown table exactly in this order:

| Artist | Start Time | Stage Name |
|--------|------------|-------------|
| [artist name] | [time] | [stage name] |

- Only include entries clearly showing an artist name, start time, and stage name.
- If the image doesn't clearly contain a readable festival schedule, reply exactly with: "I couldn't find a readable festival schedule in this image. Please upload a clearer screenshot."

Do not add extra explanations—just provide the markdown table.
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Step 2: Paste table - simplified */}
                            <div>
                              <div className="relative text-center mb-2">
                                <p className="text-white/60 text-xs">
                                  {hasGPTSubscription ? 'Paste GPT output here' : 'Paste AI prompt output here'}
                                </p>
                                <button
                                  onClick={() => setTableInput('')}
                                  className="text-edc-pink hover:text-red-500 text-xs transition-colors absolute right-0 top-0"
                                >
                                  Clear
                                </button>
                              </div>
                              <textarea
                                value={tableInput}
                                onChange={(e) => setTableInput(e.target.value)}
                                placeholder={`Example format:\n| Artist        | Start Time | Stage Name    |\n| ------------- | ---------- | ------------- |\n| Subtronics    | 10:00 PM   | Main Stage    |\n| Martin Garrix | 11:20 PM   | Kinetic Grass |`}
                                className="w-full h-32 bg-transparent border border-edc-purple/30 rounded text-white text-sm p-3 resize-none focus:outline-none focus:border-edc-pink/50 placeholder-white/40"
                              />
                            </div>
                            
                            {/* Error message display */}
                            {tableErrorMessage && (
                              <div className="mt-2 bg-red-900/60 border border-red-500/50 p-3 rounded-md relative">
                                <div className="flex items-start">
                                  <div className="text-red-400 text-sm pr-6">{tableErrorMessage}</div>
                                  <button 
                                    onClick={() => setTableErrorMessage('')}
                                    className="absolute top-2 right-2 text-red-400 hover:text-red-300"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )}
                            
                            {/* Add Schedule button */}
                            <div className="flex justify-center mt-4">
                              <button
                                onClick={processTableInput}
                                disabled={!tableInput.trim() || isProcessingTable}
                                className="bg-gradient-to-r from-edc-pink to-edc-purple hover:opacity-90 hover:shadow-md hover:shadow-edc-pink/20 disabled:opacity-50 disabled:bg-gray-700 text-white text-sm font-medium py-3 px-8 rounded-md transition-all duration-200 w-full"
                              >
                                {isProcessingTable ? 'Processing...' : 'Add Schedule'}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <ul className="space-y-2">
                  {schedules.map((schedule, idx) => (
                    <li key={idx} className="bg-black bg-opacity-60 rounded-md p-3 border border-edc-purple schedule-item">
                      <div className="flex items-center justify-between">
                        {editingScheduleIndex === idx ? (
                          <div className="flex items-center">
                            <input
                              type="text"
                              value={editingScheduleName}
                              onChange={(e) => setEditingScheduleName(e.target.value)}
                              onBlur={saveScheduleName}
                              className="bg-black/60 border border-edc-purple rounded-md py-1 px-2 text-white text-sm focus:border-edc-pink focus:outline-none focus:ring-1 focus:ring-edc-pink/30 transition-all"
                              placeholder={`Schedule ${idx + 1}`}
                              autoFocus
                            />
                            <button
                              onClick={saveScheduleName}
                              className="ml-2 text-green-400 hover:text-green-300 text-sm"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditingScheduleName}
                              className="ml-2 text-gray-400 hover:text-gray-300 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <span className="text-edc-pink font-bold">{schedule.name}</span>
                            <button
                              onClick={() => startEditingScheduleName(idx)}
                              className="ml-2 opacity-30 hover:opacity-100 transition-opacity text-white text-xs"
                              title="Edit Name"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <span className="text-edc-purple text-sm">{schedule.sets.length} sets</span>
                          <button
                            onClick={() => removeSchedule(idx)}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      
                      {/* Sets section */}
                      <div className="mt-2">
                        <div className="flex flex-col space-y-1">
                          {/* Show only first 3 sets when not expanded, or all sets when expanded */}
                          {schedule.sets.length > 0 && (expandedSchedules[idx] ? schedule.sets : schedule.sets.slice(0, 3)).map((set, setIdx) => (
                              editingSetInfo && editingSetInfo.scheduleIndex === idx && editingSetInfo.setIndex === setIdx ? (
                                // In-place editing for an existing set
                                <div key={`edit-${setIdx}`} className="grid grid-cols-[1fr_auto_1fr] md:grid-cols-3 gap-2 text-sm py-2 bg-black/20 rounded-sm border-l-2 border-edc-pink/40" ref={editSetFormRef}>
                                  <input
                                    type="text"
                                    value={editingSetInfo?.set?.artist || ''}
                                    onChange={(e) => setEditingSetInfo({
                                      ...editingSetInfo, 
                                      set: {...editingSetInfo.set, artist: e.target.value}
                                    })}
                                    className={`text-edc-pink font-medium bg-transparent border-b ${formErrors.artist ? 'border-red-500' : 'border-edc-purple/30'} focus:border-edc-pink focus:outline-none w-full text-center`}
                                    autoFocus
                                  />
                                  <input
                                    type="time"
                                    value={formatTime(editingSetInfo.set.start, 'HH:mm')}
                                    onChange={(e) => {
                                      const [hours, minutes] = e.target.value.split(':').map(Number);
                                      const date = new Date(editingSetInfo.set.start);
                                      date.setHours(hours, minutes, 0, 0);
                                      setEditingSetInfo({
                                        ...editingSetInfo, 
                                        set: {...editingSetInfo.set, start: date.toISOString()}
                                      });
                                    }}
                                    className={`text-white bg-transparent border-b ${formErrors.time ? 'border-red-500' : 'border-edc-purple/30'} focus:border-edc-pink focus:outline-none appearance-none w-[90px] text-center mx-auto [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden [&::-webkit-clear-button]:hidden [&::-ms-clear]:hidden`}
                                    style={{
                                      appearance: 'none',
                                      '-webkit-appearance': 'none',
                                      '-moz-appearance': 'textfield'
                                    }}
                                  />
                                  <div className="text-edc-blue flex items-center">
                                    <input
                                      type="text"
                                      value={editingSetInfo?.set?.stage || ''}
                                      onChange={(e) => setEditingSetInfo({
                                        ...editingSetInfo, 
                                        set: {...editingSetInfo.set, stage: e.target.value}
                                      })}
                                      className={`text-edc-blue bg-transparent border-b ${formErrors.stage ? 'border-red-500' : 'border-edc-purple/30'} focus:border-edc-pink focus:outline-none w-[70%] text-center`}
                                    />
                                    <div className="flex shrink-0 ml-auto">
                                       <button 
                                        onClick={() => {
                                          // Validate fields before saving
                                          const { artist, stage, start } = editingSetInfo.set;
                                          if (!artist || !stage || !start) {
                                            setFormErrors({
                                              artist: !artist,
                                              stage: !stage,
                                              time: !start
                                            });
                                            return;
                                          }
                                          setFormErrors({});
                                          saveEditedSet(editingSetInfo.set);
                                        }}
                                        className="text-green-500 hover:text-green-400 mx-1" 
                                        title="Save"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </button>
                                      <button 
                                        onClick={cancelEditingSet}
                                        className="text-gray-400 hover:text-gray-300 ml-1" 
                                        title="Cancel"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                // Normal display of an existing set
                                <div key={setIdx} className="grid grid-cols-[1fr_auto_1fr] md:grid-cols-3 gap-2 text-sm py-2 bg-black/30 rounded-sm border-l-2 border-edc-purple/30">
                                  <div className="text-edc-pink font-medium truncate text-center">{set.artist}</div>
                                  <div className="text-white text-center">{formatTime(set.start)}</div>
                                  <div className="text-edc-blue flex items-center">
                                    <div className="text-center truncate w-[70%]">{set.stage}</div>
                                    <div className="flex shrink-0 ml-auto">
                                      <button 
                                        onClick={() => startEditingSet(idx, setIdx)}
                                        className="text-edc-purple hover:text-edc-blue mx-1" 
                                        title="Edit Set"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                      </button>
                                      <button 
                                        onClick={() => deleteSet(idx, setIdx)}
                                        className="text-red-400 hover:text-red-300 ml-1" 
                                        title="Delete Set"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )
                            ))}
                            
                            {/* Add New Set In-place Row */}
                            {isAddingSetToSchedule === idx && (
                              <div 
                                className="grid grid-cols-[1fr_auto_1fr] md:grid-cols-3 gap-2 text-sm py-2 mt-1 bg-black/20 rounded-sm border-l-2 border-edc-green/40" 
                                ref={addSetFormRef}
                                data-add-set-form={idx}
                                key={`add-set-form-${idx}`}
                              >
                                <input
                                  type="text"
                                  id={`newSetArtist-${idx}`}
                                  value={tempNewSetValues.artist}
                                  onChange={(e) => setTempNewSetValues({...tempNewSetValues, artist: e.target.value})}
                                  className={`text-edc-pink font-medium bg-transparent border-b ${formErrors.artist ? 'border-red-500' : 'border-edc-purple/30'} focus:border-edc-pink focus:outline-none w-full text-center`}
                                  placeholder="Artist name"
                                />
                                <input
                                  type="time"
                                  id={`newSetTime-${idx}`}
                                  value={tempNewSetValues.time}
                                  onChange={(e) => setTempNewSetValues({...tempNewSetValues, time: e.target.value})}
                                  className={`text-white bg-transparent border-b ${formErrors.time ? 'border-red-500' : 'border-edc-purple/30'} focus:border-edc-pink focus:outline-none appearance-none w-[90px] text-center mx-auto [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden [&::-webkit-clear-button]:hidden [&::-ms-clear]:hidden`}
                                  style={{
                                    appearance: 'none',
                                    '-webkit-appearance': 'none',
                                    '-moz-appearance': 'textfield'
                                  }}
                                />
                                <div className="text-edc-blue flex items-center">
                                  <input
                                    type="text"
                                    id={`newSetStage-${idx}`}
                                    value={tempNewSetValues.stage}
                                    onChange={(e) => setTempNewSetValues({...tempNewSetValues, stage: e.target.value})}
                                    className={`text-edc-blue bg-transparent border-b ${formErrors.stage ? 'border-red-500' : 'border-edc-purple/30'} focus:border-edc-pink focus:outline-none w-[70%] text-center`}
                                    placeholder="Stage name"
                                  />
                                  <div className="flex shrink-0 ml-auto">
                                      <button 
                                        onClick={() => {
                                          try {
                                            console.log('Add set button clicked for schedule:', isAddingSetToSchedule);
                                            
                                            // Get the current schedule index
                                            const currentScheduleIndex = isAddingSetToSchedule;
                                            if (currentScheduleIndex === null) {
                                              console.error('No schedule selected for adding a set');
                                              return;
                                            }
                                            
                                            // Use the controlled input values from state
                                            const { artist, time: timeValue, stage } = tempNewSetValues;
                                            
                                            console.log('Form values:', { artist, timeValue, stage });
                                            
                                            // Validate form - only set errors but don't clear inputs
                                            if (!artist || !timeValue || !stage) {
                                              console.log('Form validation failed');
                                              setFormErrors({
                                                artist: !artist,
                                                time: !timeValue,
                                                stage: !stage
                                              });
                                              return;
                                            }
                                            
                                            // Clear errors
                                            setFormErrors({});
                                            
                                            // Create date object from time value
                                            const [hours, minutes] = timeValue.split(':').map(Number);
                                            const today = new Date();
                                            const date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
                                            
                                            // Create set object
                                            const newSet = {
                                              artist,
                                              stage,
                                              start: date.toISOString()
                                            };
                                            
                                            console.log('Adding new set:', newSet);
                                            
                                            // Ensure the schedule has a sets array before adding the set
                                            const updatedSchedules = [...schedules];
                                            if (!updatedSchedules[currentScheduleIndex]) {
                                              console.error(`Schedule not found at index ${currentScheduleIndex}`);
                                              return;
                                            }
                                            
                                            if (!updatedSchedules[currentScheduleIndex].sets) {
                                              console.log(`Initializing sets array for schedule ${currentScheduleIndex}`);
                                              updatedSchedules[currentScheduleIndex].sets = [];
                                              setSchedules(updatedSchedules);
                                            }
                                            
                                            // Add set to schedule
                                            addSetToSchedule(newSet);
                                            
                                            // Reset the form values after successful submission
                                            setTempNewSetValues({
                                              artist: '',
                                              time: '',
                                              stage: ''
                                            });
                                          } catch (error) {
                                            console.error('Error in add set form submission:', error);
                                          }
                                        }}
                                        className="text-green-500 hover:text-green-400 mx-1" 
                                        title="Add"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </button>
                                      <button 
                                        onClick={cancelAddingSet}
                                        className="text-gray-400 hover:text-gray-300 ml-1" 
                                        title="Cancel"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                            )}
                            
                            {/* Smaller, less intrusive Add Set button */}
                            {isAddingSetToSchedule !== idx && (
                              <button
                                data-add-set-button={idx}
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent event bubbling
                                  e.preventDefault(); // Prevent default behavior
                                  
                                  console.log(`Add Set button clicked for schedule ${idx}`);
                                  
                                  // Direct approach similar to manual entry mode
                                  setIsAddingSetToSchedule(idx);
                                  setEditingScheduleIndex(null);
                                  setEditingSetInfo(null);
                                  
                                  // Reset form values and errors when starting to add a new set
                                  setTempNewSetValues({
                                    artist: '',
                                    time: '',
                                    stage: ''
                                  });
                                  setFormErrors({});
                                  
                                  // Ensure sets array exists in the schedule
                                  const updatedSchedules = JSON.parse(JSON.stringify(schedules));
                                  if (!updatedSchedules[idx]) {
                                    console.error(`Schedule at index ${idx} does not exist`);
                                    return;
                                  }
                                  
                                  // Initialize sets array if needed
                                  if (!Array.isArray(updatedSchedules[idx].sets)) {
                                    console.log(`Initializing sets array for schedule ${idx}`);
                                    updatedSchedules[idx].sets = [];
                                    setSchedules(updatedSchedules);
                                  }
                                }}
                                className="mt-2 text-xs text-edc-blue hover:text-edc-purple flex items-center mx-auto px-2 py-0.5 bg-edc-blue/10 hover:bg-edc-blue/15 rounded-sm opacity-80 hover:opacity-100 transition-all"
                                title="Add Set"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                Add Set
                              </button>
                            )}
                            
                            {/* Show expansion button if there are more than 3 sets and not expanded */}
                            {schedule.sets.length > 3 && !expandedSchedules[idx] && (
                              <button
                                data-action="toggle-schedule-expanded"
                                onClick={() => toggleScheduleExpanded(idx)}
                                className="w-full py-0.5 text-xs text-edc-blue/70 hover:text-edc-blue transition-colors opacity-70 hover:opacity-90 border-t border-edc-purple/10"
                              >
                                Show {schedule.sets.length - 3} more sets
                              </button>
                            )}
                            
                            {/* Show hide button if expanded */}
                            {expandedSchedules[idx] && schedule.sets.length > 3 && (
                              <button
                                data-action="toggle-schedule-expanded"
                                onClick={() => toggleScheduleExpanded(idx)}
                                className="w-full py-0.5 text-xs text-edc-purple/70 hover:text-edc-purple transition-colors opacity-70 hover:opacity-90 border-t border-edc-purple/10"
                              >
                                Hide {schedule.sets.length - 3} sets
                              </button>
                            )}
                            
                            {/* We no longer need to show expanded sets here because we're showing them in the main set map */}
                            
                            {/* No need for warning message, using inline validation */}
                          </div>
                        </div>
                        
                        {/* Add Set button moved above the show/hide buttons */}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            <div className="mt-4"></div>
      

      
      {/* We removed modals in favor of inline editing */}
      
        {schedules.length > 0 && (
                <button
                  onClick={findMeetupGaps}
                  disabled={schedules.length < 2}
                  className={`w-full py-3 rounded-md text-white font-medium transition-all ${schedules.length >= 2 
                    ? 'bg-gradient-to-r from-edc-blue to-edc-pink hover:opacity-90 transition-opacity animate-glow' 
                    : 'bg-gray-700 cursor-not-allowed opacity-50'}`}
                >
                  Find Meetup Times
                </button>
              )}
            </div>
            {/* Tip Jar removed from here and moved to appear on all pages */}
          </div>
        )}
        
        {/* Meetup Gaps Page */}
        {currentPage === 'meetupGaps' && meetupGaps.length > 0 && (
          <div id="meetup-results" className="w-full bg-black bg-opacity-70 backdrop-blur-sm p-6 rounded-lg border border-edc-pink shadow-lg shadow-edc-pink/20">
            {/* Back button */}
            <div className="flex justify-between items-center mb-4">
              <button 
                onClick={() => navigateBack('main')}
                className="px-4 py-2 bg-black/60 text-white/80 border border-edc-purple/30 rounded-md hover:bg-black/80 hover:text-white hover:border-edc-purple/80 transition-all flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Schedules
              </button>
              
              <div className="relative">  
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInstructions(!showInstructions);
                  }}
                  className="w-6 h-6 rounded-full bg-black/60 border border-edc-blue/50 flex items-center justify-center text-edc-blue font-bold hover:bg-black/80 hover:border-edc-blue transition-colors help-button"
                >
                  ?
                </button>
                {showInstructions && (
                  <div className="absolute md:left-full top-0 md:ml-2 md:top-0 top-full right-0 md:right-auto mt-2 md:mt-0 w-72 p-3 bg-black/95 border border-edc-purple/50 rounded-md z-10 shadow-lg instructions-popup">
                    <p className="text-edc-blue/90 text-sm mb-2 font-medium">How to use:</p>
                    <ol className="text-xs text-white/80 list-decimal list-inside space-y-1 mb-2">
                      <li>Upload screenshots or add sets manually</li>
                      <li>Verify sets and Add Schedule</li>
                      <li>Repeat for all friends' schedules</li>
                      <li>Generate meetup times</li>
                      <li>Select meetup times & create plan</li>
                      <li>Add meetup spots & share plan</li>
                    </ol>
                    <p className="text-xs text-edc-pink/90 italic mb-4">
                      TIP: Make sure your screenshots show the time, artist, and stage clearly.
                    </p>
                    <p className="text-edc-blue/90 text-sm font-medium mb-2">
                      Video Walkthrough
                    </p>
                    <div className="mt-2 pointer-events-auto">
                    <video
                      className="w-full rounded-md object-cover"
                      style={{ aspectRatio: '9/16' }}
                      controls
                      preload="metadata"
                      poster="/demo_video/thumbnail.png"
                    >
                      <source
                        src="/demo_video/planner_app_demo.mp4"
                        type="video/mp4"
                      />
                      Your browser doesn’t support HTML5 video.
                    </video>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <h2 className="text-xl font-medium text-edc-blue/90 mb-2">Potential Meetup Times</h2>
            <p className="text-xs text-edc-purple/80 mb-4 tracking-wide">Select the meetup times you're interested in:</p>
            
            <div className="space-y-3 mb-6">
              {meetupGaps.map((gap, idx) => (
                <div 
                  key={idx}
                  className={`p-4 rounded-md border cursor-pointer transition-all ${
                    gap.isRecommended 
                      ? selectedGaps[idx]
                        ? 'border-edc-pink bg-gradient-to-br from-green-900/20 to-black/90'
                        : 'border-green-500/70 bg-green-900/5 hover:bg-green-900/10'
                      : selectedGaps[idx]
                        ? 'border-edc-pink bg-edc-purple/5'
                        : 'border-gray-500/50 bg-black/70 hover:bg-black/80'
                  }`}
                  onClick={() => toggleGapSelection(idx)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-edc-pink flex">
                        <span className="whitespace-nowrap">{formatTime(gap.start)} - {formatTime(gap.end)}</span>
                        <span className="ml-2 text-white text-sm font-normal whitespace-nowrap">({formatDuration(gap.start, gap.end)})</span>
                      </p>
                      
                      {gap.beforeCommonArtist && (
                        <p className="text-green-400 text-sm flex items-center">
                          {gap.isRecommended && <span className="mr-1">✓</span>}
                          <span>Before {gap.beforeCommonArtist} @ {gap.beforeStage}</span>
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center">
                      {selectedGaps[idx] && (
                        <span className="bg-edc-pink text-black text-xs font-bold px-2 py-1 rounded-full mr-2">
                          Selected
                        </span>
                      )}
                      <div className={`w-5 h-5 rounded-full border-2 ${
                        selectedGaps[idx] 
                          ? 'border-edc-pink bg-edc-pink' 
                          : 'border-white'
                      }`}>
                        {selectedGaps[idx] && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-black" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 text-sm">
                    <p className="text-edc-blue">Available for: 
                      <span className="text-white ml-1">
                        {gap.commonSchedules ? gap.commonSchedules.join(', ') : gap.schedules.join(', ')}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-between items-center">
              <p className="text-edc-purple text-sm">
                <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-1"></span> Recommended meetup times before common sets
              </p>
              
              <p className="text-xs text-white">
                {Object.keys(selectedGaps).length} of {meetupGaps.length} selected
              </p>
            </div>
            
            <div className="mt-4 flex justify-center">
              <button
                onClick={generateMeetups}
                disabled={Object.keys(selectedGaps).length === 0}
                className={`px-8 py-3 rounded-md text-white font-medium ${
                  Object.keys(selectedGaps).length > 0
                    ? 'bg-gradient-to-r from-edc-pink to-edc-purple hover:opacity-90'
                    : 'bg-gray-700 cursor-not-allowed opacity-50'
                }`}
              >
                Generate Meetup Plan
              </button>
            </div>
          </div>
        )}
        
        {/* Meetup Plan Page */}
        {currentPage === 'meetupPlan' && meetupPlan.length > 0 && (
          <div id="meetup-plan" className="w-full bg-black bg-opacity-70 backdrop-blur-sm p-6 rounded-lg">
            <div ref={meetupPlanRef}>
              {/* Custom header has been removed to make a cleaner image */}
            {/* Back button */}
            <div className="flex justify-between items-center mb-4">
              <button 
                onClick={() => navigateBack('meetupGaps')}
                className="px-4 py-2 bg-black/50 text-white/70 border border-edc-purple/30 rounded-md hover:bg-black/70 hover:text-white/90 hover:border-edc-purple/50 transition-all flex items-center text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Meetup Times
              </button>

              <div className="relative">  
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInstructions(!showInstructions);
                  }}
                  className="w-6 h-6 rounded-full bg-black/60 border border-edc-blue/50 flex items-center justify-center text-edc-blue font-bold hover:bg-black/80 hover:border-edc-blue transition-colors help-button"
                >
                  ?
                </button>
                {showInstructions && (
                  <div className="absolute md:left-full top-0 md:ml-2 md:top-0 top-full right-0 md:right-auto mt-2 md:mt-0 w-72 p-3 bg-black/95 border border-edc-purple/50 rounded-md z-10 shadow-lg instructions-popup">
                    <p className="text-edc-blue/90 text-sm mb-2 font-medium">How to use:</p>
                    <ol className="text-xs text-white/80 list-decimal list-inside space-y-1 mb-2">
                      <li>Upload screenshots or add sets manually</li>
                      <li>Verify sets and Add Schedule</li>
                      <li>Repeat for all friends' schedules</li>
                      <li>Generate meetup times</li>
                      <li>Select meetup times & create plan</li>
                      <li>Add meetup spots & share plan</li>
                    </ol>
                    <p className="text-xs text-edc-pink/90 italic mb-4">
                      TIP: Make sure your screenshots show the time, artist, and stage clearly.
                    </p>
                    <p className="text-edc-blue/90 text-sm font-medium mb-2">
                      Video Walkthrough
                    </p>
                    <div className="mt-2 pointer-events-auto">
                    <video
                      className="w-full rounded-md object-cover"
                      style={{ aspectRatio: '9/16' }}
                      controls
                      preload="metadata"
                      poster="/demo_video/thumbnail.png"
                    >
                      <source
                        src="/demo_video/planner_app_demo.mp4"
                        type="video/mp4"
                      />
                      Your browser doesn’t support HTML5 video.
                    </video>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <h2 className="text-xl font-medium text-edc-pink/80 mb-1 text-center">Your Meetup Plan</h2>
            <div className="text-white/40 text-xs text-center mb-3">Created with meetuptimes.com • {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            
            <div className="space-y-6">
              {meetupPlan.map((meetup, idx) => (
                <div 
                  key={meetup.id || idx}
                  className={`flex flex-col border-l-2 px-1 py-2 my-1 rounded-r-md ${meetup.isRecommended ? 'border-green-500/60 bg-green-900/5' : 'border-edc-purple/60 bg-edc-purple/5'}`}
                >
                  <div className="flex justify-between items-center pl-4">
                    <h3 className="text-edc-blue/90 font-medium text-lg">{`#${idx + 1}: Before ${meetup.beforeCommonArtist || 'Next Artist'} @ ${meetup.beforeStage || 'Unknown Stage'}`}</h3>
                  </div>
                  
                  <div className="flex items-center pl-4 mt-1">
                    <p className="text-edc-purple/90">
                      {formatTime(meetup.start)} - {formatTime(meetup.end)}
                      <span className="text-white/70 text-xs ml-2">({formatDuration(meetup.start, meetup.end)})</span>
                    </p>
                  </div>
                  
                  <div className="flex items-start pl-4 mt-1">
                    <span className="text-edc-purple text-xs">
                      {meetup.schedules.join(', ')}
                    </span>
                  </div>
                  
                  {/* Location section - editable */}
                  <div className="flex items-center pl-4 mt-2">
                    {editingLocationIndex === idx ? (
                      <div className="flex items-center w-full pr-4">
                        <input 
                          type="text" 
                          value={editingLocation}
                          onChange={(e) => setEditingLocation(e.target.value)}
                          placeholder="Enter meetup spot..."
                          className="bg-black/30 border border-edc-purple/30 text-white/90 text-sm rounded px-2 py-1 w-full"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              saveLocation();
                            } else if (e.key === 'Escape') {
                              cancelEditingLocation();
                            }
                          }}
                        />
                        <div className="flex ml-2">
                          <button 
                            onClick={saveLocation}
                            className="text-green-400/90 hover:text-green-400 mr-1"
                            title="Save location"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button 
                            onClick={cancelEditingLocation}
                            className="text-red-400/90 hover:text-red-400"
                            title="Cancel"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center w-full text-sm">
                        {meetup.customLocation ? (
                          <>
                            <span className="text-edc-pink text-xs mr-2">📍</span>
                            <span className="text-edc-pink text-xs">{meetup.customLocation}</span>
                          </>
                        ) : (
                          <span className="text-edc-pink/50 text-xs italic cursor-pointer hover:text-edc-pink/80" onClick={() => startEditingLocation(idx)}>
                            + Add meetup spot
                          </span>
                        )}
                        {meetup.customLocation && (
                          <button 
                            onClick={() => startEditingLocation(idx)}
                            className="ml-2 text-edc-pink/50 hover:text-edc-pink/80"
                            title="Edit location"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        )}

                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Footer removed for cleaner screenshot */}
            </div>
            
            </div>
            
            {/* Action buttons */}
            <div className="mt-6 flex justify-center space-x-4">
              <button 
                id="save-image-button"
                onClick={saveMeetupPlanAsImage}
                className="px-4 py-2 bg-edc-blue/30 text-white/90 rounded-md hover:bg-edc-blue/50 transition-all duration-200 flex items-center text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16v-4" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6" />
                </svg>
                Save as Image
              </button>
              
              <button 
                onClick={resetApp}
                className="px-4 py-2 bg-red-900/40 text-white/90 rounded-md hover:bg-red-700/60 transition-all duration-200 flex items-center text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset Everything
              </button>
            </div>
          </div>
        )}
        
        {/* Footer section with Tip Jar and About Me */}
        <div className="text-center mt-6 mb-4 border-t border-edc-purple/10 pt-4">
          <VenmoTipJar />
          
          <div className="-mt-1 opacity-70 hover:opacity-100 transition-opacity">
            <a 
              href="https://linktr.ee/mushiewaffle" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] text-white/70 hover:text-edc-pink/90 transition-colors"
            >
              About
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
