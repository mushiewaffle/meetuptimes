import React, { useState, useEffect, useRef, Fragment } from 'react';
import { parseISO, format } from 'date-fns';
import html2canvas from 'html2canvas';
import './App.css';

// Components
import FestivalScheduleUploader from './components/FestivalScheduleUploader';
import VenmoTipJar from './components/VenmoTipJar';
import EDCPicker from './components/EDCPicker';
// Import removed - no longer needed
import findSharedGaps from './utils/findSharedGaps';
import festivalSchedule from './data/festivalSchedule';
import { getDayInfo, getStageMeetupSpot } from './utils/stageZones';

// Day separator drawn above the first set of each festival night in long
// schedule lists. Visually anchored in the night's color (Fri = cyan,
// Sat = pink, Sun = purple) and a fading horizontal rule so groups read as
// distinct sections without screaming at the user.
function DayHeader({ night, compact = false }) {
  const info = getDayInfo(night);
  if (!info) return null;
  // The right-hand divider used to be a fading linear-gradient stripe, but
  // html2canvas chokes on a 1px-tall gradient flex child (createPattern on
  // a 0-height pattern source) and crashed the Save-as-Image flow. A flat
  // semi-transparent line in the night's color reads almost identically
  // and renders cleanly in both the live UI and the exported PNG.
  return (
    <div className={`flex items-center gap-2 ${compact ? 'mt-2 mb-1 first:mt-0' : 'mt-4 mb-1.5 first:mt-1'}`}>
      <div
        className="font-orbitron text-[10px] font-bold tracking-[0.25em] uppercase whitespace-nowrap"
        style={{ color: info.color, textShadow: `0 0 8px ${info.glow}` }}
      >
        {info.short} · {info.date}
      </div>
      <div
        className="flex-1 h-px"
        style={{ backgroundColor: `${info.color}55` }}
      />
    </div>
  );
}

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
  
  // Parse table input for AI parsing mode.
  //
  // Real-user bug: GPT often returns plain space-separated text instead of
  // a strict markdown table with pipes — the old parser silently rejected
  // every line. Now handles three formats:
  //
  //   1. Pipe markdown: `| Sun | Whethan | 2:30 AM | Basspod |`
  //   2. Tab/space-aligned: `Sun  Whethan  2:30 AM  Basspod`
  //   3. Plain text:    `Sun Whethan 2:30 AM Basspod`
  //
  // For non-pipe formats we use the time pattern (e.g. "2:30 AM") as an
  // anchor: text before the time = optional day prefix + artist; text
  // after = stage.
  const parseTableInput = (input) => {
    if (!input.trim()) return [];

    const lines = input.trim().split('\n');
    const parsedSets = [];

    // Strip markdown link wrapping like [Lu.Re](http://Lu.Re) -> Lu.Re
    const stripMdLinks = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    const dayMap = {
      fri: 'Fri', friday: 'Fri',
      sat: 'Sat', saturday: 'Sat',
      sun: 'Sun', sunday: 'Sun',
    };
    // Time pattern that we'll use as the anchor for plain-text rows.
    // Matches "2:30 AM", "11:00pm", "2:30AM" etc.
    const timeAnchor = /(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)/i;
    // Also accept dot-separated times like "2.30 PM"
    const timeAnchorDot = /(\d{1,2})\.(\d{2})\s*(am|pm|a\.m\.|p\.m\.)/i;
    const findTime = (s) => s.match(timeAnchor) || s.match(timeAnchorDot);

    // Detect overall format up front so we don't have to guess per line.
    const hasPipes = lines.some((l) => /\|/.test(l));

    let columnIndices = { day: -1, artist: 0, time: 1, stage: 2 };
    let headerSeen = false;

    // Track "current day" from standalone day-header lines like "Sunday:"
    // or "SUN —". Subsequent rows that don't include their own day prefix
    // inherit this context.
    let currentDayContext = '';
    const justDayHeaderRegex = /^(friday|saturday|sunday|fri|sat|sun)\b\s*[:\-—–]?\s*$/i;

    // Punctuation/separator chars to strip from field boundaries when
    // splitting plain-text rows (commas, semicolons, pipes, dashes, tabs,
    // colons, parens-around-day, etc.).
    const stripBoundaries = (s) => s.replace(/^[\s,;:|\-—–\t]+|[\s,;:|\-—–\t]+$/g, '');

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;
      // Skip markdown separator rows: `|---|---|` or `------`
      if (/^[\s\-:|]+$/.test(rawLine)) continue;

      // "Sunday:" / "Sun —" / etc. — sets day context for subsequent rows
      const dayHeader = rawLine.match(justDayHeaderRegex);
      if (dayHeader) {
        currentDayContext = dayMap[dayHeader[1].toLowerCase()] || currentDayContext;
        continue;
      }

      let day = '';
      let artist = '';
      let timeStr = '';
      let stage = '';

      // PIPES TAKE PRIORITY. If the input contains ANY pipe markdown,
      // we treat the whole input as pipe-formatted. Lines that have
      // pipes parse normally; lines without pipes are SKIPPED (rather
      // than falling back to plain-text parsing, which could produce
      // wrong results from prose, comments, or stray text the GPT
      // included around the table).
      if (hasPipes) {
        if (!/\|/.test(rawLine)) continue;
        // ---- Pipe-separated markdown table ----
        const columns = rawLine
          .split('|')
          .map((c) => c.trim())
          .filter((c) => c.length > 0);

        // Detect header row: first row containing column-name keywords AND no time.
        if (!headerSeen && i <= 2 && /artist|time|stage|day/i.test(rawLine) && !findTime(rawLine)) {
          for (let j = 0; j < columns.length; j++) {
            const header = columns[j].toLowerCase();
            if (header === 'day' || header.startsWith('day')) columnIndices.day = j;
            else if (header.includes('artist') || header.includes('dj') || header.includes('performer')) columnIndices.artist = j;
            else if (header.includes('time') || header.includes('start')) columnIndices.time = j;
            else if (header.includes('stage') || header.includes('location')) columnIndices.stage = j;
          }
          headerSeen = true;
          continue;
        }

        if (columns.length < 3) continue;
        artist = stripMdLinks(columns[columnIndices.artist] || '').trim();
        timeStr = columns[columnIndices.time] || '';
        stage = columns[columnIndices.stage] || '';
        const dayRaw = columnIndices.day >= 0 ? (columns[columnIndices.day] || '').toLowerCase() : '';
        day = dayMap[dayRaw] || '';
      } else {
        // ---- Plain text (no pipes anywhere in input) — anchor on the time pattern ----
        const timeMatch = findTime(rawLine);
        if (!timeMatch) continue; // not a data row (header/blurb/etc.)

        const beforeTime = rawLine.substring(0, timeMatch.index).trim();
        const afterTime = stripBoundaries(
          rawLine.substring(timeMatch.index + timeMatch[0].length),
        );
        timeStr = timeMatch[0];

        // Look for a day prefix in the first 1–2 tokens (handles bullets
        // like "1. Sun …" or "- Sun …" where the day isn't strictly first).
        const tokens = beforeTime.split(/\s+/).filter(Boolean);
        let dayIdx = -1;
        for (let k = 0; k < Math.min(2, tokens.length); k++) {
          const clean = tokens[k].toLowerCase().replace(/[^a-z]/g, '');
          if (dayMap[clean]) {
            dayIdx = k;
            break;
          }
        }
        if (dayIdx >= 0) {
          day = dayMap[tokens[dayIdx].toLowerCase().replace(/[^a-z]/g, '')];
          artist = tokens
            .filter((_, k) => k !== dayIdx)
            .join(' ')
            .trim();
        } else {
          artist = beforeTime;
        }

        artist = stripBoundaries(stripMdLinks(artist));
        stage = stripBoundaries(afterTime);
      }

      // Fall back to the inherited day context if the row didn't have its own
      if (!day && currentDayContext) day = currentDayContext;

      const time = convertToTimeFormat(timeStr);
      if (time && artist && stage) {
        parsedSets.push({
          time,
          artist,
          stage,
          day, // optional — used by processTableInput to compute the right calendar date
        });
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
      
      // Convert to the format expected by the schedule (with ISO date strings).
      // When the GPT output includes a Day column, anchor each set to the correct
      // EDC night so multi-day pastes order correctly. AM hours roll into the
      // next calendar day (festival-night convention).
      const NIGHT_BASE = {
        Fri: { y: 2026, m: 4, d: 15 },
        Sat: { y: 2026, m: 4, d: 16 },
        Sun: { y: 2026, m: 4, d: 17 },
      };
      const formattedSets = parsedSets.map(set => {
        const [hours, minutes] = set.time.split(':').map(Number);
        let date;
        if (set.day && NIGHT_BASE[set.day]) {
          const base = NIGHT_BASE[set.day];
          const dayOffset = hours < 12 ? 1 : 0;
          date = new Date(base.y, base.m, base.d + dayOffset, hours, minutes);
        } else {
          const today = new Date();
          date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        }

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
  const [noGapsFound, setNoGapsFound] = useState(false);

  
  // These variables have been removed as they're no longer needed
  
  // Show/hide instructions
  // Help button state removed
  
  // These variables have been removed as they're no longer needed
  
  // Help button click outside handler removed
  
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

  // EDC picker state
  // pickerTargetIdx: null = create new schedule from picks, number = merge into that schedule
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetIdx, setPickerTargetIdx] = useState(null);

  // "How does this work?" help modal — accessible from the top-right ? button.
  const [showHelp, setShowHelp] = useState(false);

  // Reset Everything confirmation modal — replaces window.confirm() which
  // is ugly on mobile and blocks programmatic UI testing.
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleOpenPickerForNew = () => {
    setPickerTargetIdx(null);
    setPickerOpen(true);
  };

  const handleOpenPickerForExisting = (scheduleIndex) => {
    setPickerTargetIdx(scheduleIndex);
    setPickerOpen(true);
  };

  // Resolve the IDs of festivalSchedule entries already in a saved schedule, so
  // the picker can pre-check those rows when the user re-opens it to edit.
  // Matches by start ISO + artist + stage (the natural composite key).
  const getInitialSelectionFromSchedule = (schedule) => {
    if (!schedule || !Array.isArray(schedule.sets)) return [];
    const ids = [];
    for (const s of schedule.sets) {
      const match = festivalSchedule.find(
        (f) => f.start === s.start && f.artist === s.artist && f.stage === s.stage,
      );
      if (match) ids.push(match.id);
    }
    return ids;
  };

  const handleEDCPickerSave = (sets, name) => {
    setPickerOpen(false);
    const trimmedName = (name || '').trim();
    if (pickerTargetIdx === null) {
      // Default fallback when the user leaves the name input blank:
      // first schedule = "Your picks", subsequent = "Friend 1", "Friend 2"…
      const scheduleName =
        trimmedName ||
        (schedules.length === 0 ? 'Your Schedule' : `Friend ${schedules.length}`);
      // Append new schedules at the END so the spatial direction matches the
      // newly-bottom-positioned "Add" button (most recent shows up just above
      // the button you tapped to add it).
      setSchedules([...schedules, { name: scheduleName, sets }]);
    } else {
      // Edit mode: the picker was pre-filled with the schedule's existing
      // sets AND name, so on save we replace both — unchecking removes sets,
      // editing the name in the input renames the schedule.
      const updated = [...schedules];
      const target = updated[pickerTargetIdx];
      if (target) {
        const sortedSets = [...sets].sort((a, b) => new Date(a.start) - new Date(b.start));
        target.sets = sortedSets;
        if (trimmedName) target.name = trimmedName;
        setSchedules(updated);
      }
    }
    // Outdated meetup gaps once schedules change
    setMeetupGaps([]);
    setMeetupPlan([]);
  };
  
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
      } else {
        // Clear localStorage when all schedules are removed
        localStorage.removeItem('festivalSchedules');
      }
      
      if (Object.keys(selectedGaps).length > 0 || meetupPlan.length > 0) {
        localStorage.setItem('festivalMeetups', JSON.stringify({ 
          selectedGaps,
          meetupPlan 
        }));
      } else {
        localStorage.removeItem('festivalMeetups');
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
      
      // If schedule count drops below 2, reset noGapsFound state
      // to ensure the correct message is displayed
      if (updatedSchedules.length < 2) {
        setNoGapsFound(false);
      }
      
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
  const startEditingSet = (scheduleIndex, setIndex, fieldToFocus = 'artist') => {
    const setToEdit = { ...schedules[scheduleIndex].sets[setIndex] };
    setEditingSetInfo({ scheduleIndex, setIndex, set: setToEdit, fieldToFocus });
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
   * Handle saving a set when the Enter key is pressed
   * @param {Event} e - The keyboard event
   */
  const handleEnterKeySave = (e) => {
    if (e.key === 'Enter' && editingSetInfo) {
      e.preventDefault();
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
    }
  };

  /**
   * Handle adding a new set when the Enter key is pressed
   * @param {Event} e - The keyboard event
   */
  const handleNewSetEnterKey = (e) => {
    if (e.key === 'Enter' && isAddingSetToSchedule !== null) {
      e.preventDefault();
      try {
        // Use the controlled input values from state
        const { artist, time: timeValue, stage } = tempNewSetValues;
        
        // Validate form
        if (!artist || !timeValue || !stage) {
          setFormErrors({
            artist: !artist,
            time: !timeValue,
            stage: !stage
          });
          return;
        }
        
        // Reset errors since validation passed
        setFormErrors({});
        
        // Create a date object from the time value
        const [hours, minutes] = timeValue.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        
        // Create the new set object
        const newSet = {
          artist,
          stage,
          start: date.toISOString()
        };
        
        // Add the set to the schedule
        addSetToSchedule(newSet);
      } catch (error) {
        console.error('Error adding set via enter key:', error);
      }
    }
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
      
      
      
      // Create a completely new copy of schedules to avoid reference issues
      const updatedSchedules = JSON.parse(JSON.stringify(schedules));
      
      // Ensure the schedule exists
      if (!updatedSchedules[isAddingSetToSchedule]) {
        console.error('Schedule not found at index:', isAddingSetToSchedule);
        return;
      }
      
      // Always initialize sets as an array, even if it already exists
      if (!Array.isArray(updatedSchedules[isAddingSetToSchedule].sets)) {
        
        updatedSchedules[isAddingSetToSchedule].sets = [];
      }
      
      // Add the new set
      updatedSchedules[isAddingSetToSchedule].sets.push(newSet);
      
      
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
      return;
    }
    
    try {
      // Reset no gaps found state
      setNoGapsFound(false);
      
      // Find all shared gaps
      const gaps = findSharedGaps(schedules);
      
      if (gaps.length === 0) {
        setNoGapsFound(true);
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

      // Festival-night ordinal so gaps sort Fri → Sat → Sun first, then by
      // time within each night. Without this, the adjusted-time sort
      // interleaves nights (e.g. FRI 7:45 PM and SAT 7:45 PM end up adjacent
      // because they share the same adjusted-time), which defeats the day
      // separators and makes the list confusing to scan.
      const NIGHT_RANK = { Fri: 0, Sat: 1, Sun: 2 };
      const getNightRank = (start) => {
        const night = getFestivalNight(start);
        return night && night in NIGHT_RANK ? NIGHT_RANK[night] : 3;
      };

      // Sort gaps: recommended first, then by night, then by festival time
      gaps.sort((a, b) => {
        if (a.isRecommended !== b.isRecommended) {
          return a.isRecommended ? -1 : 1;
        }
        const nightDiff = getNightRank(a.start) - getNightRank(b.start);
        if (nightDiff !== 0) return nightDiff;
        const timeA = getAdjustedSortTime(new Date(a.start));
        const timeB = getAdjustedSortTime(new Date(b.start));
        return timeA - timeB;
      });
      
      // Set the found gaps
      setMeetupGaps(gaps);
      
      // Reset selections and plan
      setSelectedGaps({});
      setMeetupPlan([]);
      
      
      
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
      // Clone the plan and apply the screenshot-mode class. The legacy
      // per-element style mutations (matching `.location-container`,
      // `[class*="border-l-2"]`, etc.) targeted the old card structure and
      // were both dead code AND, where they did match, would zero out the
      // padding that prevents the bottom row from being clipped.
      const offscreenElement = meetupPlanRef.current.cloneNode(true);
      offscreenElement.classList.add('screenshot-mode');

      // Tighten meetup card padding for the exported image — the natural
      // py-3 (12px top/bottom) felt loose in screenshots. Also strip any
      // overflow:hidden / text-ellipsis on descendants so html2canvas can't
      // clip glyphs at row boundaries.
      offscreenElement.querySelectorAll('.meetup-card').forEach((card) => {
        card.style.paddingTop = '10px';
        card.style.paddingBottom = '10px';
        card.querySelectorAll('*').forEach((node) => {
          if (node instanceof HTMLElement) {
            const cs = window.getComputedStyle(node);
            if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden') {
              node.style.overflow = 'visible';
            }
            if (cs.textOverflow === 'ellipsis') {
              node.style.textOverflow = 'clip';
              node.style.whiteSpace = 'normal';
            }
          }
        });
      });

      // Position the clone offscreen at a fixed share-friendly width.
      offscreenContainer = document.createElement('div');
      offscreenContainer.style.position = 'absolute';
      offscreenContainer.style.left = '-9999px';
      offscreenContainer.style.top = '0';
      offscreenContainer.style.width = '600px';
      offscreenContainer.style.padding = '4px';
      offscreenContainer.appendChild(offscreenElement);
      document.body.appendChild(offscreenContainer);

      // Force a synchronous layout pass so scrollHeight is accurate before
      // we measure (otherwise the offscreen element can report a height
      // that doesn't yet include all wrapped content).
      // eslint-disable-next-line no-unused-expressions
      offscreenElement.offsetHeight;
      const fullHeight = Math.max(
        offscreenElement.scrollHeight,
        offscreenElement.offsetHeight,
      );
      const fullWidth = Math.max(
        offscreenElement.scrollWidth,
        offscreenElement.offsetWidth,
      );

      // html2canvas options. Pass explicit width/height to avoid the
      // viewport-clip behavior that was cutting off the last card's
      // meetup-spot row in tall plans.
      const options = {
        backgroundColor: '#121212',
        scale: window.innerWidth < 768 ? 2 : 3,
        logging: false,
        allowTaint: true,
        useCORS: true,
        scrollX: 0,
        scrollY: 0,
        width: fullWidth,
        height: fullHeight,
        windowWidth: fullWidth,
        windowHeight: fullHeight,
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
                
                // Create clickable thumbnail preview.
                // Capped at ~62vh so the full image stays visible on mobile
                // AND the "press and hold to save" instruction below remains
                // on-screen without scrolling.
                const preview = document.createElement('img');
                preview.src = dataUrl;
                preview.style.width = 'auto';
                preview.style.maxWidth = '88%';
                preview.style.maxHeight = '62vh';
                preview.style.objectFit = 'contain';
                preview.style.borderRadius = '8px';
                preview.style.boxShadow = '0 0 12px rgba(255,0,255,0.25)';
                preview.style.cursor = 'pointer';

                // Add prominent press-and-hold instruction below the image.
                const hint = document.createElement('div');
                hint.style.marginTop = '16px';
                hint.style.padding = '10px 16px';
                hint.style.borderRadius = '999px';
                hint.style.background = 'rgba(255, 0, 255, 0.12)';
                hint.style.border = '1px solid rgba(255, 0, 255, 0.4)';
                hint.style.color = 'rgba(255, 255, 255, 0.95)';
                hint.style.fontSize = '13px';
                hint.style.fontWeight = '600';
                hint.style.textAlign = 'center';
                hint.style.maxWidth = '88%';
                hint.innerHTML = '👆 Press and hold the image to save';

                // Subtle helper text below the main hint
                const subHint = document.createElement('div');
                subHint.style.marginTop = '8px';
                subHint.style.color = 'rgba(255, 255, 255, 0.5)';
                subHint.style.fontSize = '11px';
                subHint.style.textAlign = 'center';
                subHint.innerHTML = 'Tap × in the corner when done';

                overlay.appendChild(preview);
                overlay.appendChild(hint);
                overlay.appendChild(subHint);
                
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
   * Export a single schedule as a shareable PNG.
   *
   * Builds the export DOM from scratch (rather than cloning + mutating the
   * live card) so we can guarantee:
   *   – no Edit / Remove buttons in the output
   *   – every set is included even if the live card is collapsed
   *     ("Show N more sets")
   *   – consistent share-friendly width regardless of viewport
   *   – an EDC 2026 header at the top so receivers know what they're
   *     looking at out of context
   *
   * Same mobile-vs-desktop handling as saveMeetupPlanAsImage: native
   * Photos write on Capacitor, press-and-hold preview overlay on
   * mobile web, silent download on desktop.
   */
  const exportScheduleAsImage = (scheduleIdx) => {
    const schedule = schedules[scheduleIdx];
    if (!schedule) return;

    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);

    const escapeHtml = (s) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Build a self-contained offscreen container styled inline (so the
    // export looks the same regardless of which CSS classes are loaded).
    const offscreenContainer = document.createElement('div');
    offscreenContainer.style.position = 'absolute';
    offscreenContainer.style.left = '-9999px';
    offscreenContainer.style.top = '0';
    offscreenContainer.style.width = '640px';
    offscreenContainer.style.padding = '14px 12px 14px';
    offscreenContainer.style.backgroundColor = '#121212';
    offscreenContainer.style.color = '#ffffff';
    offscreenContainer.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    offscreenContainer.style.borderRadius = '12px';
    offscreenContainer.style.boxSizing = 'border-box';

    // Group sets by night so the export shows the same Fri / Sat / Sun
    // section headers the user sees in-app — multi-day schedules read as
    // distinct sections instead of one wall.
    const sortedSets = schedule.sets
      .slice()
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    let prevNight = null;
    const setsHtml = sortedSets
      .map((set) => {
        const night = getFestivalNight(set.start) || '';
        const startTime = formatTime(set.start);
        const endTime = set.end ? formatTime(set.end) : null;
        const dayInfo = getDayInfo(night);

        let header = '';
        if (night && night !== prevNight && dayInfo) {
          // First group: small top margin; subsequent: extra breathing room.
          const isFirst = prevNight === null;
          header = `
            <div style="display:flex;align-items:center;gap:8px;${isFirst ? 'margin-top:0' : 'margin-top:10px'};margin-bottom:3px;">
              <div style="font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.25em;color:${dayInfo.color};text-transform:uppercase;text-shadow:0 0 8px ${dayInfo.glow};white-space:nowrap;">${dayInfo.short} · ${escapeHtml(dayInfo.date)}</div>
              <div style="flex:1;height:1px;background-color:${dayInfo.color}55;"></div>
            </div>
          `;
          prevNight = night;
        } else if (night && !prevNight) {
          prevNight = night;
        }

        // Single-line row laid out with flex: time on the left (fixed
        // width via nowrap), artist in the flexible middle column, stage
        // pinned to the right (also nowrap). The stage cannot be
        // visually clipped because it is its own flex item with
        // white-space:nowrap — if anything has to give, it is the artist
        // column that wraps to a 2nd line, not the stage. This also
        // sidesteps html2canvas's spotty support for text-overflow.
        const timeRange = endTime
          ? `${escapeHtml(startTime)} – ${escapeHtml(endTime)}`
          : escapeHtml(startTime);
        return `${header}
          <div style="display:flex;align-items:baseline;gap:12px;padding:5px 11px 6px;background:rgba(0,0,0,0.35);border-left:3px solid rgba(153,102,255,0.5);border-radius:6px;font-size:13px;line-height:1.4;">
            <span style="flex-shrink:0;font-weight:600;color:#ffffff;font-variant-numeric:tabular-nums;white-space:nowrap;">${timeRange}</span>
            <span style="flex:1;min-width:0;color:#ff36de;font-weight:600;">${escapeHtml(set.artist)}</span>
            <span style="flex-shrink:0;color:rgba(45,212,255,0.75);font-size:11px;white-space:nowrap;">${escapeHtml(set.stage)}</span>
          </div>
        `;
      })
      .join('');

    const exportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    offscreenContainer.innerHTML = `
      <div style="text-align:center;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid rgba(255,54,222,0.2);">
        <div style="font-size:10px;letter-spacing:0.3em;color:#2dd4ff;font-family:'Orbitron',sans-serif;text-transform:uppercase;">EDC LAS VEGAS 2026 · MAY 15–17</div>
        <div style="font-size:20px;font-weight:bold;color:#ff36de;margin-top:4px;font-family:'Orbitron',sans-serif;letter-spacing:0.02em;">My EDC Schedule</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Created with meetuptimes.com · ${escapeHtml(exportDate)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;">
        ${setsHtml || '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:24px 0;font-size:13px;">No sets in this schedule yet.</div>'}
      </div>
    `;

    document.body.appendChild(offscreenContainer);

    // Force layout so dimensions are accurate
    // eslint-disable-next-line no-unused-expressions
    offscreenContainer.offsetHeight;

    const filename = `${schedule.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'schedule'}-EDC-2026.png`;

    const options = {
      backgroundColor: '#121212',
      scale: window.innerWidth < 768 ? 2 : 3,
      logging: false,
      allowTaint: true,
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
      width: offscreenContainer.offsetWidth,
      height: offscreenContainer.offsetHeight,
      windowWidth: offscreenContainer.offsetWidth,
      windowHeight: offscreenContainer.offsetHeight,
    };

    html2canvas(offscreenContainer, options)
      .then((canvas) => {
        const dataUrl = canvas.toDataURL('image/png');
        document.body.removeChild(offscreenContainer);

        canvas.toBlob(async (blob) => {
          if (Capacitor.isNativePlatform()) {
            const reader = new FileReader();
            reader.onload = async () => {
              const base64 = reader.result.split(',')[1];
              try {
                await Filesystem.writeFile({
                  path: filename,
                  data: base64,
                  directory: Directory.Photos,
                });
                alert('Saved to Photos');
              } catch (err) {
                console.error('Filesystem error:', err);
                alert('Failed to save to Photos');
              }
            };
            reader.readAsDataURL(blob);
            return;
          }

          if (isMobile) {
            // Same press-and-hold preview overlay as the meetup plan flow
            const overlay = document.createElement('div');
            overlay.style.cssText =
              'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
            const preview = document.createElement('img');
            preview.src = dataUrl;
            preview.style.cssText =
              'width:auto;max-width:88%;max-height:62vh;object-fit:contain;border-radius:8px;box-shadow:0 0 12px rgba(255,0,255,0.25);';
            const hint = document.createElement('div');
            hint.style.cssText =
              'margin-top:16px;padding:10px 16px;border-radius:999px;background:rgba(255,0,255,0.12);border:1px solid rgba(255,0,255,0.4);color:rgba(255,255,255,0.95);font-size:13px;font-weight:600;text-align:center;max-width:88%;';
            hint.innerHTML = '👆 Press and hold the image to save';
            const subHint = document.createElement('div');
            subHint.style.cssText =
              'margin-top:8px;color:rgba(255,255,255,0.5);font-size:11px;text-align:center;';
            subHint.innerHTML = 'Tap × in the corner when done';
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText =
              'position:absolute;top:10px;right:10px;background:transparent;border:none;color:rgba(255,255,255,0.7);font-size:28px;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center;padding:0;';
            closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
            overlay.appendChild(preview);
            overlay.appendChild(hint);
            overlay.appendChild(subHint);
            overlay.appendChild(closeBtn);
            document.body.appendChild(overlay);
          } else {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = filename;
            link.click();
          }
        });
      })
      .catch((err) => {
        console.error('Schedule export error:', err);
        if (document.body.contains(offscreenContainer)) {
          document.body.removeChild(offscreenContainer);
        }
        alert('There was an error exporting the schedule. Please try again.');
      });
  };

  /**
   * Reset the entire app to initial state.
   * The actual reset runs after the user confirms in the inline modal —
   * this entry point just opens the modal.
   */
  const resetApp = () => {
    setShowResetConfirm(true);
  };

  const performReset = () => {
    setShowResetConfirm(false);
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

        // Pre-fill `customLocation` with a recognizable landmark near the
        // upcoming common-set's stage so the meetup card opens with a
        // sensible default instead of an empty "Add meetup spot" prompt.
        // The user can still edit or clear it before sharing.
        const suggestedSpot = getStageMeetupSpot(gap.beforeStage);
        return {
          id: `meetup-${Date.now()}-${index}`,
          start: gap.start,
          end: gap.end,
          schedules: gap.commonSchedules || gap.schedules, // Use the same schedules shown in the Potential Meetup Times page
          beforeStage: gap.beforeStage,
          beforeCommonArtist: gap.beforeCommonArtist,
          isRecommended: gap.schedules.length === schedules.length,
          customLocation: suggestedSpot,
        };
      })
      .filter(Boolean);
      
      // Sort plan by festival night first, then by clock time within the
      // night. The day-separator headers in the meetup-plan UI rely on
      // consecutive same-night cards — a pure adjusted-time sort interleaves
      // FRI/SAT cards (same time-of-night) and breaks the visual grouping.
      const getAdjustedSortTime = (date) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const adjustedHours = (hours >= 8) ? hours - 8 : hours + 16;
        return adjustedHours * 60 + minutes;
      };
      const NIGHT_RANK = { Fri: 0, Sat: 1, Sun: 2 };
      const getNightRank = (start) => {
        const night = getFestivalNight(start);
        return night && night in NIGHT_RANK ? NIGHT_RANK[night] : 3;
      };

      plan.sort((a, b) => {
        const nightDiff = getNightRank(a.start) - getNightRank(b.start);
        if (nightDiff !== 0) return nightDiff;
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

  // Map a Date back to the festival-night it belongs to (so a 4 AM set on
  // calendar-day Saturday is labeled as the conclusion of "Friday Night").
  // Returns 'Fri' | 'Sat' | 'Sun' | null.
  const getFestivalNight = (time) => {
    try {
      if (!time) return null;
      const date = typeof time === 'string' ? parseISO(time) : time;
      if (isNaN(date.getTime())) return null;
      const adj = new Date(date);
      if (adj.getHours() < 12) adj.setDate(adj.getDate() - 1);
      const ds = `${adj.getFullYear()}-${String(adj.getMonth() + 1).padStart(2, '0')}-${String(adj.getDate()).padStart(2, '0')}`;
      if (ds === '2026-05-15') return 'Fri';
      if (ds === '2026-05-16') return 'Sat';
      if (ds === '2026-05-17') return 'Sun';
      return null;
    } catch {
      return null;
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
      customLocation: editingLocation.trim(),
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
      <div className="max-w-5xl mx-auto w-full relative">
        {/* "?" help button — subtle top-right corner. Quick refresher for users
            who land mid-flow or get confused about what the app does. */}
        <button
          onClick={() => setShowHelp(true)}
          className="absolute top-0 right-2 w-8 h-8 rounded-full border border-edc-purple/40 hover:border-edc-blue text-edc-blue/70 hover:text-edc-blue text-sm font-bold flex items-center justify-center transition-colors z-10"
          aria-label="How does this work?"
          title="How does this work?"
        >
          ?
        </button>
        <header className="text-center mb-8">
          <div className="font-orbitron tracking-[0.3em] text-[10px] sm:text-xs text-edc-blue mb-2">
            EDC LAS VEGAS 2026 · MAY 15–17
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-edc-blue via-edc-purple to-edc-pink mb-2 font-orbitron">
            EDC 2026
          </h1>
          <p className="text-edc-purple text-base sm:text-lg">
            Find sets and meetup times with friends
          </p>
        </header>
        
        {/* Main page with schedule input and schedule list */}
        {currentPage === 'main' && (
          <div className="flex flex-col gap-6">
            <div className="w-full space-y-4">
            
            {/* Schedule list display.
                `flex flex-col` + `order-*` on children rearranges visually
                without restructuring the JSX: heading (default order 0)
                stays on top, schedule list (`order-1`) sits in the middle,
                and the Add Schedule button block (`order-2`) sits at the
                bottom — matching the natural "new entries append below"
                mental model. */}
            <div className="mt-4 flex flex-col">
              {/* Centered title with more prominence */}
              <div className="text-center mb-4">
                <h3 className="text-2xl font-bold text-edc-blue bg-gradient-to-r from-edc-blue to-edc-pink bg-clip-text text-transparent inline-block">
                  {schedules.length === 0
                    ? 'Get started'
                    : schedules.length === 1
                      ? "Now add a friend's schedule"
                      : 'Schedules'}
                </h3>
              </div>
                
                {/* Conditionally show either the Add Schedule button or the Schedule Creation Options.
                    The button label and visual weight scale to the user's progress:
                    – 0 schedules: subtle teal "Add Your Schedule" (just get started)
                    – 1 schedule: prominent gradient "Add Friend's Schedule" with glow + arrow
                       (real-user testing showed people didn't realize they needed step 2 — this
                       makes the next step impossible to miss)
                    – 2+ schedules: subtle teal "Add Another Schedule" (just an option) */}
                {!showScheduleOptions ? (
                  <div className="order-2 flex justify-center mt-4">
                    <button
                      onClick={handleShowScheduleOptions}
                      className={
                        schedules.length === 1
                          ? 'w-full py-3.5 rounded-md text-white font-bold text-base bg-gradient-to-r from-edc-pink to-edc-purple hover:opacity-90 animate-glow shadow-lg shadow-edc-pink/30 transition-all duration-200 flex items-center justify-center font-orbitron tracking-wide'
                          : 'w-full py-2.5 rounded-md text-white font-medium bg-edc-blue/40 hover:bg-edc-blue/60 transition-all duration-200 flex items-center justify-center'
                      }
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      {schedules.length === 0
                        ? 'Add Your Schedule'
                        : schedules.length === 1
                          ? "Add Friend's Schedule →"
                          : "Add Another Friend's Schedule"}
                    </button>
                  </div>
                ) : (
                   <div className="order-2 border border-edc-purple/30 rounded-lg mt-4 overflow-hidden bg-black/30">
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
                            {/* Pick from Lineup (the primary, friction-free path) */}
                            <button
                              onClick={() => {
                                setShowScheduleOptions(false);
                                handleOpenPickerForNew();
                              }}
                              className="bg-edc-blue/10 hover:bg-edc-blue/20 border-2 border-edc-blue/50 hover:border-edc-blue rounded-lg p-4 flex flex-col items-center transition-all relative"
                            >
                              <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest text-edc-blue/80 font-bold">Recommended</span>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-edc-blue mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                              </svg>
                              <span className="text-edc-blue font-bold">Pick from Lineup</span>
                              <span className="text-white/60 text-xs mt-1 text-center">Tap sets from EDC's 425-artist lineup. ~30 sec.</span>
                            </button>

                            {/* From Insomniac Screenshot — uses AI (custom GPT or
                                copy-paste prompt) to convert a screenshot into a
                                table the app can read. The visual flow communicates
                                the 3 steps: 📷 photo → 🤖 AI → 📋 paste. */}
                            <button
                              onClick={() => {
                                setShowGPTSubscriptionOptions(true);
                                setHasGPTSubscription(null);
                              }}
                              className="bg-black/40 hover:bg-black/60 border border-edc-purple/30 hover:border-edc-purple/60 rounded-lg p-4 flex flex-col items-center transition-all"
                            >
                              {/* Visual flow: camera → AI sparkle → clipboard */}
                              <div className="flex items-center gap-1.5 mb-2 text-edc-pink">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <circle cx="12" cy="13" r="3.5" strokeWidth={1.5} />
                                </svg>
                                <span className="text-xs font-bold tracking-wider">→</span>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3l1.5 4L18 8.5l-4.5 1.5L12 14l-1.5-4L6 8.5 10.5 7 12 3zM5 16l.75 2L7.5 18.75 5.75 19.5 5 21l-.75-1.5L2.5 18.75l1.75-.75L5 16zM19 14l1 2.5 2.5 1-2.5 1L19 21l-1-2.5L15.5 17.5 18 16.5 19 14z" />
                                </svg>
                                <span className="text-xs font-bold tracking-wider">→</span>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                              </div>
                              <span className="text-edc-pink font-bold">From Insomniac Screenshot</span>
                              <span className="text-white/60 text-xs mt-1 text-center leading-snug">
                                Send your schedule photo to ChatGPT, it converts it to a table, then paste here.
                              </span>
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
                                // Non-premium user — copy-paste prompt for any AI.
                                // Includes the Day column so multi-night EDC schedules
                                // anchor to the correct festival night when imported.
                                <div className="relative space-y-3">
                                  <p className="text-white/80 text-xs">
                                    Copy this prompt + paste with your schedule screenshot(s) into ChatGPT (or any AI):
                                  </p>
                                  <div
                                    className="bg-black/40 border border-edc-purple/30 rounded p-3 text-white/80 text-xs cursor-pointer hover:border-edc-pink/50 transition-colors"
                                    onClick={() => {
                                      navigator.clipboard.writeText(
                                        `I have a screenshot of an EDC Las Vegas 2026 schedule. Extract the information into a clean markdown table exactly in this order:

| Day | Artist | Start Time | Stage Name |
|-----|--------|------------|-------------|
| [Fri/Sat/Sun] | [artist name] | [time] | [stage name] |

Rules:
- Day: use exactly one of \`Fri\`, \`Sat\`, or \`Sun\`. Read it from the row text (e.g., "Sunday - 4:00 AM" → \`Sun\`) or from a section header in the screenshot. Use the literal day shown — do not shift late-night sets to the previous day. If the day is genuinely not visible anywhere in the image, leave the Day cell blank rather than guessing.
- Artist: keep the name exactly as shown, including any suffix in parentheses (e.g., "(Sunrise Set)", "(b2b ArtistX)"). Do NOT wrap artist names in markdown links — output \`Lu.Re\`, never \`[Lu.Re](http://Lu.Re)\`.
- Start Time: keep the original 12-hour AM/PM format from the screenshot.
- Stage Name: keep as shown, exact spelling and casing.
- Only include entries clearly showing an artist name, start time, and stage name.
- If multiple screenshots are uploaded, merge them into one combined table sorted by Day (Fri → Sat → Sun), then by Start Time within each day.
- Do not include duplicates across screenshots.
- If the image doesn't clearly contain a readable festival schedule, reply exactly with: "I couldn't find a readable festival schedule in this image. Please upload a clearer screenshot."

Do not add extra explanations—just provide the markdown table.`,
                                      );
                                      setCopiedPrompt(true);
                                      setTimeout(() => setCopiedPrompt(false), 2000);
                                    }}
                                  >
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-medium text-edc-blue">Prompt to copy</span>
                                      <span className="text-edc-pink text-xs">{copiedPrompt ? 'Copied!' : 'Click to copy'}</span>
                                    </div>
                                    <div className="text-white/60 whitespace-pre-line text-xs">
{`Extract every set from the uploaded schedule screenshot(s) into one markdown table:

| Day | Artist | Start Time | Stage Name |

Day must be Fri / Sat / Sun (read it directly from the screenshot — don't shift late-night sets). Keep parentheticals like "(Sunrise Set)". Do not wrap artist names in markdown links. Merge multiple screenshots into one sorted table; skip duplicates.

If the image isn't readable, reply exactly:
"I couldn't find a readable festival schedule in this image. Please upload a clearer screenshot."`}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Step 2: Paste table - simplified */}
                            <div>
                              <div className="relative text-center mb-2">
                                <p className="text-white/60 text-xs">
                                  {hasGPTSubscription ? 'Paste GPT output here' : 'Paste AI output here'}
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
                                placeholder={`Example format:\n| Day | Artist                | Start Time | Stage Name    |\n| --- | --------------------- | ---------- | ------------- |\n| Fri | Subtronics            | 10:00 PM   | Basspod       |\n| Sat | Martin Garrix         | 11:20 PM   | Kinetic Field |\n| Sun | Lu.Re                 | 4:30 AM    | Stereo Bloom  |`}
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
                            
                            {/* Live preview count — gives the user a confidence
                                signal BEFORE they commit. If parsing produced 0
                                rows from non-empty input, the warning makes it
                                obvious that the format wasn't recognized so they
                                can fix it without creating an empty schedule. */}
                            {tableInput.trim() && (() => {
                              const previewCount = parseTableInput(tableInput).length;
                              return (
                                <div className="mt-3 text-xs text-center">
                                  {previewCount > 0 ? (
                                    <span className="text-edc-blue">
                                      ✓ Detected {previewCount} {previewCount === 1 ? 'set' : 'sets'} ready to add
                                    </span>
                                  ) : (
                                    <span className="text-red-400/80">
                                      ⚠ No sets detected. Make sure each row has an artist, time (e.g. 2:30 PM), and stage.
                                    </span>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Add Schedule button */}
                            <div className="flex justify-center mt-3">
                              <button
                                onClick={processTableInput}
                                disabled={!tableInput.trim() || isProcessingTable || parseTableInput(tableInput).length === 0}
                                className="bg-gradient-to-r from-edc-pink to-edc-purple hover:opacity-90 hover:shadow-md hover:shadow-edc-pink/20 disabled:opacity-30 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium py-3 px-8 rounded-md transition-all duration-200 w-full"
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
                <ul className="order-1 space-y-2">
                  {schedules.map((schedule, idx) => (
                    <li key={idx} className="bg-black bg-opacity-60 rounded-md p-3 border border-edc-purple schedule-item">
                      {/* gap-3 ensures the truncated schedule name doesn't run
                          flush into the "X sets · Edit · Remove" group when
                          a user gives a schedule a long name. */}
                      <div className="flex items-center justify-between gap-3">
                        {editingScheduleIndex === idx ? (
                          <div className="flex items-center">
                            <input
                              type="text"
                              value={editingScheduleName}
                              onChange={(e) => setEditingScheduleName(e.target.value)}
                              onBlur={saveScheduleName}
                              onKeyDown={(e) => e.key === 'Enter' && saveScheduleName()}
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
                          <div className="flex items-center min-w-0 flex-1">
                            {/* Schedule name — display-only here. Renaming
                                happens in the picker (one consolidated edit
                                action), so the inline pencil is gone. */}
                            <span className="text-edc-pink font-bold truncate">{schedule.name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-edc-purple text-sm">{schedule.sets.length} sets</span>
                          <button
                            onClick={() => exportScheduleAsImage(idx)}
                            className="text-edc-pink hover:text-white text-sm transition-colors"
                            title="Export as shareable image"
                            disabled={schedule.sets.length === 0}
                          >
                            Export
                          </button>
                          <button
                            onClick={() => handleOpenPickerForExisting(idx)}
                            className="text-edc-blue hover:text-white text-sm transition-colors"
                            title="Edit name and sets"
                          >
                            Edit
                          </button>
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
                          {/* Show only first 3 sets when not expanded, or all sets when expanded.
                              Sets are interleaved with DayHeader dividers when the festival
                              night changes (Fri → Sat → Sun) so multi-day schedules read as
                              clearly grouped sections instead of one undifferentiated wall. */}
                          {(() => {
                            const visibleSets = schedule.sets.length > 0
                              ? (expandedSchedules[idx] ? schedule.sets : schedule.sets.slice(0, 3))
                              : [];
                            let prevNight = null;
                            return visibleSets.map((set, setIdx) => {
                              const night = getFestivalNight(set.start);
                              const showHeader = night && night !== prevNight;
                              // Only update prevNight on a valid night so a stray
                              // null-night row doesn't reset the tracker and trigger
                              // a duplicate header on the next valid row.
                              if (night) prevNight = night;
                              const isEditing = editingSetInfo && editingSetInfo.scheduleIndex === idx && editingSetInfo.setIndex === setIdx;
                              return (
                                <Fragment key={`row-${setIdx}`}>
                                  {showHeader && <DayHeader night={night} compact />}
                                  {isEditing ? (
                                // In-place editing for an existing set
                                <div className="grid grid-cols-[1fr_auto_1fr] md:grid-cols-3 gap-2 text-sm py-2 bg-black/20 rounded-sm border-l-2 border-edc-pink/40" ref={editSetFormRef}>
                                  <input
                                    type="text"
                                    value={editingSetInfo?.set?.artist || ''}
                                    onChange={(e) => setEditingSetInfo({
                                      ...editingSetInfo, 
                                      set: {...editingSetInfo.set, artist: e.target.value}
                                    })}
                                    className={`text-edc-pink font-medium bg-transparent border-b ${formErrors.artist ? 'border-red-500' : 'border-edc-purple/30'} focus:border-edc-pink focus:outline-none w-full text-center`}
                                    onKeyDown={handleEnterKeySave}
                                    autoFocus={editingSetInfo.fieldToFocus === 'artist'}
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
                                    onKeyDown={handleEnterKeySave}
                                    autoFocus={editingSetInfo.fieldToFocus === 'time'}
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
                                      onKeyDown={handleEnterKeySave}
                                      autoFocus={editingSetInfo.fieldToFocus === 'stage'}
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
                                // Display layout (no per-row controls — all editing
                                // happens through the schedule's "Edit sets" button).
                                // Note: explicit `text-left` is required because
                                // App.css sets `text-align: center` globally on #root.
                                <div
                                  className="flex items-center gap-3 py-2.5 px-3 bg-black/30 rounded-md border-l-2 border-edc-purple/40"
                                >
                                  <div className="shrink-0 w-16 text-center">
                                    <div className="text-sm text-white tabular-nums leading-tight font-semibold whitespace-nowrap">
                                      {formatTime(set.start)}
                                    </div>
                                    {set.end && (
                                      <div className="text-[10px] text-white/40 tabular-nums leading-tight mt-0.5 whitespace-nowrap">
                                        ends {formatTime(set.end)}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 text-left">
                                    <div className="text-edc-pink font-semibold leading-tight truncate text-sm">{set.artist}</div>
                                    <div className="text-edc-blue/70 text-[11px] leading-tight truncate mt-0.5">{set.stage}</div>
                                  </div>
                                </div>
                              )}
                                </Fragment>
                              );
                            });
                          })()}
                            
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
                                  onKeyDown={handleNewSetEnterKey}
                                />
                                <input
                                  type="time"
                                  id={`newSetTime-${idx}`}
                                  value={tempNewSetValues.time}
                                  onChange={(e) => setTempNewSetValues({...tempNewSetValues, time: e.target.value})}
                                  className={`text-white bg-transparent border-b ${formErrors.time ? 'border-red-500' : 'border-edc-purple/30'} focus:border-edc-pink focus:outline-none appearance-none w-[90px] text-center mx-auto [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden [&::-webkit-clear-button]:hidden [&::-ms-clear]:hidden`}
                                  onKeyDown={handleNewSetEnterKey}
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
                                    onKeyDown={handleNewSetEnterKey}
                                  />
                                  <div className="flex shrink-0 ml-auto">
                                      <button 
                                        onClick={() => {
                                          try {
                                            
                                            
                                            // Get the current schedule index
                                            const currentScheduleIndex = isAddingSetToSchedule;
                                            if (currentScheduleIndex === null) {
                                              console.error('No schedule selected for adding a set');
                                              return;
                                            }
                                            
                                            // Use the controlled input values from state
                                            const { artist, time: timeValue, stage } = tempNewSetValues;
                                            
                                            
                                            
                                            // Validate form - only set errors but don't clear inputs
                                            if (!artist || !timeValue || !stage) {
                                              
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
                                            
                                            
                                            
                                            // Ensure the schedule has a sets array before adding the set
                                            const updatedSchedules = [...schedules];
                                            if (!updatedSchedules[currentScheduleIndex]) {
                                              console.error(`Schedule not found at index ${currentScheduleIndex}`);
                                              return;
                                            }
                                            
                                            if (!updatedSchedules[currentScheduleIndex].sets) {
                                              
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
                            
                            {/* The big "Edit sets" button moved to the schedule's
                                header (top-right "Edit" link next to "Remove").
                                Same picker, same flow — just less visual weight in
                                the card body. */}
                            
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

                {/* "No overlap" warning — sits with the Find Meetup Times
                    button (order-3) so the warning appears next to the action
                    it modifies. */}
                {schedules.length >= 2 && noGapsFound && (
                  <div className="order-3 mt-4 text-center py-1.5 px-2 bg-edc-purple/10 border border-edc-purple/30 rounded-md">
                    <span className="text-edc-purple text-xs font-medium">
                      No overlap yet — try adding a shared set in both schedules.
                    </span>
                  </div>
                )}

                {/* Find Meetup Times — order-3 sits at the bottom, BELOW the
                    secondary "Add Another" (order-2). Mental model: adding
                    schedules is grouped with the schedule list; Find Meetup
                    Times is the finishing action once you've added everyone. */}
                {schedules.length >= 2 && (
                  <button
                    onClick={findMeetupGaps}
                    disabled={noGapsFound}
                    className="order-3 mt-4 w-full py-3 rounded-md text-white font-bold text-base font-orbitron tracking-wider transition-all bg-gradient-to-r from-edc-blue to-edc-pink hover:opacity-90 animate-glow disabled:from-gray-700 disabled:to-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Find Meetup Times →
                  </button>
                )}
              </div>
            
            <div className="mt-4"></div>
      

      
      {/* Empty-state hint for first-time users — only shown when nothing has
          been added yet, so the screen stays clean instead of front-loading a
          disabled button + red warning the user can't act on. */}
      {schedules.length === 0 && !showScheduleOptions && (
        <div className="mt-2 mb-2 text-center text-xs text-white/50 px-2 leading-relaxed">
          <span className="text-edc-blue">1.</span> Add your sets ·{' '}
          <span className="text-edc-pink">2.</span> Add a friend's sets ·{' '}
          <span className="text-edc-purple">3.</span> See when you can meet up
        </div>
      )}

      {/* (Find Meetup Times button + no-overlap warning moved inside the
          flex container above so they sit between the schedules and the Add
          button.) */}
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
              
              {/* Help button removed */}
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
                      <p className="font-bold text-edc-pink flex flex-wrap items-baseline gap-x-2">
                        {getFestivalNight(gap.start) && (
                          <span className="text-[10px] font-orbitron tracking-widest text-edc-blue uppercase">
                            {getFestivalNight(gap.start)} Night
                          </span>
                        )}
                        <span className="whitespace-nowrap">{formatTime(gap.start)} - {formatTime(gap.end)}</span>
                        <span className="text-white text-sm font-normal whitespace-nowrap">({formatDuration(gap.start, gap.end)})</span>
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
              </div>
            
              <h2 className="text-xl font-medium text-edc-pink/80 mb-1 text-center">EDC meetup plan</h2>
              <div className="text-white/40 text-xs text-center mb-3">Created with meetuptimes.com • {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            
              <div className="space-y-4 text-left">
                {(() => {
                  // Group meetups by festival night with a DayHeader between
                  // groups, mirroring the schedule list. Multi-day meetup
                  // plans now read as clearly bounded sections (Fri / Sat /
                  // Sun) instead of one long undifferentiated stream.
                  let prevNight = null;
                  return meetupPlan.map((meetup, idx) => {
                    const night = getFestivalNight(meetup.start);
                    const showHeader = night && night !== prevNight;
                    if (night) prevNight = night;
                    return (
                      <Fragment key={meetup.id || idx}>
                        {showHeader && <DayHeader night={night} />}
                        <div
                          className="rounded-xl border-l-4 border-edc-pink bg-edc-purple/[0.04] px-4 py-3 text-left meetup-card"
                        >
                          {/* Time + day on a single header line. The day badge
                              sits right-aligned with the time so the card opens
                              with one tight, scannable row instead of a separate
                              "#1 / SAT NIGHT" preamble. */}
                          <div className="flex items-baseline justify-between gap-2 mb-1.5">
                            <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                              <span className="text-lg font-bold text-white tabular-nums leading-none">
                                {formatTime(meetup.start)} – {formatTime(meetup.end)}
                              </span>
                              <span className="text-white/40 text-xs leading-none">
                                · {formatDuration(meetup.start, meetup.end)}
                              </span>
                            </div>
                            {night && (
                              <span className="shrink-0 text-[11px] font-orbitron tracking-widest text-edc-blue uppercase">
                                {night}
                              </span>
                            )}
                          </div>

                          <div className="leading-snug">
                            <span className="text-white/50 text-sm">Before</span>{' '}
                            <span className="text-edc-pink font-semibold text-base">
                              {meetup.beforeCommonArtist || 'next artist'}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className="text-[10px] uppercase tracking-widest text-white/40">Stage:</span>
                            <span className="text-edc-blue/80 text-xs">
                              {meetup.beforeStage || 'unknown stage'}
                            </span>
                          </div>

                      <div className="text-xs text-white/60 mt-1.5">
                        {meetup.schedules.join(' · ')}
                      </div>

                      {/* Meetup spot — single line. The 📍 emoji alone signals
                          "rendezvous point", so the explicit label is redundant.
                          When filled, the text is in a non-button so html2canvas
                          captures it (App.css hides every <button> in screenshot
                          mode). */}
                      <div className="mt-2 pt-2 border-t border-edc-purple/15">
                        {editingLocationIndex === idx ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingLocation}
                              onChange={(e) => setEditingLocation(e.target.value)}
                              placeholder="e.g. by the kineticFIELD entrance…"
                              className="flex-1 bg-black/30 border border-edc-purple/30 text-white/90 text-sm rounded px-2 py-1 focus:outline-none focus:border-edc-pink"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveLocation();
                                else if (e.key === 'Escape') cancelEditingLocation();
                              }}
                            />
                            <button
                              onClick={saveLocation}
                              className="px-3 py-1 bg-edc-purple/60 hover:bg-edc-purple/80 rounded text-white text-xs hide-in-screenshot"
                            >
                              Save
                            </button>
                          </div>
                        ) : meetup.customLocation ? (
                          // Note: NO `truncate` on the location text — its
                          // overflow:hidden combined with html2canvas's height
                          // measurement was clipping descenders in the saved
                          // image. Long locations now wrap to a second line
                          // (still readable, still captured fully).
                          <div className="flex items-start gap-2 text-sm pb-1">
                            <span className="text-edc-pink/80 shrink-0 leading-tight">📍</span>
                            <span className="flex-1 text-white/90 leading-tight break-words min-w-0">
                              {meetup.customLocation}
                            </span>
                            <button
                              onClick={() => startEditingLocation(idx)}
                              className="text-edc-blue/50 hover:text-edc-blue/80 shrink-0 transition-colors hide-in-screenshot p-0.5"
                              title="Edit meetup spot"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditingLocation(idx)}
                            className="flex items-center gap-2 text-sm text-edc-pink/60 hover:text-edc-pink/90 transition-colors hide-in-screenshot"
                          >
                            <span className="text-edc-pink/80">📍</span>
                            <span>Add meetup spot</span>
                          </button>
                        )}
                      </div>
                    </div>
                      </Fragment>
                    );
                  });
                })()}
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

      {/* Reset Everything confirmation modal — inline, themed, dismissable
          via X / Cancel / backdrop. Replaces native window.confirm(). */}
      {showResetConfirm && (
        <div
          onClick={() => setShowResetConfirm(false)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-edc-black border border-red-500/40 rounded-2xl p-5 shadow-2xl"
          >
            <h2 className="text-lg font-bold text-white mb-2">Reset everything?</h2>
            <p className="text-sm text-white/70 mb-5 leading-relaxed">
              This will delete all your schedules and meetup plans. This cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="py-2.5 rounded-md border border-edc-purple/40 hover:bg-edc-purple/10 text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={performReset}
                className="py-2.5 rounded-md bg-red-500/80 hover:bg-red-500 text-white text-sm font-bold transition-colors"
              >
                Reset everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "How does this work?" modal — concise 3-step walkthrough.
          All inner text uses text-left explicitly because App.css sets a
          global text-align: center on #root that bleeds into modal content
          and made the body text look misaligned next to the numbered circles. */}
      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-edc-black border border-edc-purple/40 rounded-2xl shadow-2xl text-left max-h-[90vh] overflow-y-auto"
          >
            <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
              <div className="text-left">
                <div className="font-orbitron tracking-widest text-[10px] text-edc-blue mb-1">
                  HOW IT WORKS
                </div>
                <h2 className="text-xl font-bold text-white leading-tight">
                  3 steps to your meetup plan
                </h2>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="shrink-0 text-white/40 hover:text-edc-pink text-2xl leading-none w-8 h-8 flex items-center justify-center -mt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <ol className="px-5 pb-4 space-y-4 text-left">
              <li className="flex gap-3 text-left">
                <div className="shrink-0 w-8 h-8 rounded-full bg-edc-blue/20 border-2 border-edc-blue/60 text-edc-blue font-bold text-sm flex items-center justify-center">
                  1
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-white font-semibold text-sm mb-0.5">Pick your sets</div>
                  <div className="text-white/60 text-xs leading-relaxed">
                    Tap the EDC 2026 artists you want to see. Switch between Fri, Sat, and Sun with the tabs.
                  </div>
                </div>
              </li>
              <li className="flex gap-3 text-left">
                <div className="shrink-0 w-8 h-8 rounded-full bg-edc-pink/20 border-2 border-edc-pink/60 text-edc-pink font-bold text-sm flex items-center justify-center">
                  2
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-white font-semibold text-sm mb-0.5">Add your friend's sets</div>
                  <div className="text-white/60 text-xs leading-relaxed">
                    Same picker — tap their picks and name the schedule (e.g. "Alice"). Repeat for as many friends as you want.
                  </div>
                </div>
              </li>
              <li className="flex gap-3 text-left">
                <div className="shrink-0 w-8 h-8 rounded-full bg-edc-purple/20 border-2 border-edc-purple/60 text-edc-purple font-bold text-sm flex items-center justify-center">
                  3
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-white font-semibold text-sm mb-0.5">Find Meetup Times</div>
                  <div className="text-white/60 text-xs leading-relaxed">
                    The app finds time slots right before sets you both picked. Lock in your favorites to build a shareable meetup plan.
                  </div>
                </div>
              </li>
            </ol>

            <div className="px-5 pb-4 text-[11px] text-white/40 leading-relaxed border-t border-edc-purple/20 pt-3 text-left space-y-2">
              <div>
                <span className="text-edc-blue/80 font-semibold">Privacy:</span> all your picks stay on this device — nothing is uploaded.
              </div>
              <div>
                <span className="text-edc-pink/80 font-semibold">Have a screenshot?</span> Use the "From Insomniac Screenshot" option to skip the tap-from-list step.
              </div>
              <div>
                <span className="text-edc-purple/80 font-semibold">Issues or feedback?</span>{' '}
                <a
                  href="mailto:mushiewaffle67@gmail.com?subject=meetuptimes.com%20feedback"
                  className="text-white/60 hover:text-edc-blue underline underline-offset-2 transition-colors"
                >
                  mushiewaffle67@gmail.com
                </a>
              </div>
            </div>

            <div className="px-5 pb-5">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-3 rounded-md bg-gradient-to-r from-edc-blue to-edc-pink hover:opacity-90 text-white font-bold text-sm font-orbitron tracking-wider transition-opacity"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDC roster picker — modal for tap-from-list set selection. The
          schedule's name is now an editable field at the top of the picker
          (replacing the old static title), so creating and naming happen in
          a single integrated flow.
          – New 1st schedule:   default name "Your picks" (editable)
          – New 2nd+ schedule:  empty + placeholder "Friend's name…"
          – Editing existing:   pre-filled with current schedule.name */}
      <EDCPicker
        open={pickerOpen}
        initialSelection={
          pickerTargetIdx !== null
            ? getInitialSelectionFromSchedule(schedules[pickerTargetIdx])
            : []
        }
        initialName={
          pickerTargetIdx !== null
            ? schedules[pickerTargetIdx]?.name ?? ''
            : schedules.length === 0
              ? 'Your Schedule'
              : ''
        }
        namePlaceholder={
          pickerTargetIdx === null && schedules.length > 0
            ? "Friend's name…"
            : 'Schedule name…'
        }
        onSave={handleEDCPickerSave}
        onCancel={() => setPickerOpen(false)}
      />
    </div>
  );
}

export default App;
