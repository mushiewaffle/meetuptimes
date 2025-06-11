import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { addHours, setHours, setMinutes } from 'date-fns';

/**
 * Component for uploading and processing festival schedule images
 * Supports multiple image uploads and identifies different festival formats
 */
const SetTimeImageUploader = ({ onSetsExtracted }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [debugText, setDebugText] = useState('');
  const [previewSrc, setPreviewSrc] = useState('');
  const fileInputRef = useRef(null);

  // Function for batch image upload removed to fix linting errors
  // Single file upload is now handled by handleFileUpload

  /**
   * Extract set time information from uploaded image using OCR
   * Parses the result to find artist names, times, and stages
   */
  const processImage = async (file) => {
    setIsProcessing(true);
    console.log(`Processing ${file.name}...`);
    setDebugText('');
    
    // Create a preview of the image for debugging
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewSrc(e.target.result);
    };
    reader.readAsDataURL(file);

    try {
      console.log('Starting OCR processing...');
      
      // Initialize Tesseract worker
      const worker = await createWorker({
        logger: m => {
          console.log('Tesseract status:', m.status, m.progress);
          if (m.status === 'recognizing text') {
            setProgress(parseInt(m.progress * 100));
          }
        }
      });

      // Load English language for OCR
      console.log('Loading language...');
      await worker.loadLanguage('eng');
      await worker.initialize('eng');

      // Set image recognition parameters optimized for Festival schedule format
      console.log('Setting parameters...');
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:-&@.,()[]{}\'"/_ ',
        tessedit_pageseg_mode: '3', // Fully automatic page segmentation, but no OSD
        tessedit_ocr_engine_mode: '2'  // Use LSTM neural network engine
      });

      console.log('Processing complete');
      console.log('Recognizing text...');
      const { data: { text } } = await worker.recognize(file);
      console.log('Recognition complete');
      await worker.terminate();
      
      // Preprocess text to fix common OCR errors
      const preprocessedText = preprocessOcrText(text);
      
      // Set debug text for troubleshooting
      setDebugText(preprocessedText);
      console.log('Extracted text:', preprocessedText);

      let extractedSets = [];
      extractedSets = parseSetTimeText(preprocessedText);
      // Set the debug text to show the extracted sets for user feedback
      setDebugText(
        extractedSets.map(set => {
          const startTime = new Date(set.start);
          let hours = startTime.getHours();
          const minutes = startTime.getMinutes().toString().padStart(2, '0');
          const ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours ? hours : 12;
          return `${set.artist} at ${set.stage} (${hours}:${minutes} ${ampm})`;
        }).join('\n')
      );
      
      console.log('Final parsed sets:', extractedSets);
      
      // Call the callback with the extracted sets
      if (extractedSets.length > 0) {
        onSetsExtracted(extractedSets);
        setIsProcessing(false);
        // Clear file input for next upload
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // Clear preview
        setPreviewSrc('');
      } else {
        setError('No valid set times could be extracted from the image. Try a clearer screenshot.');
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('OCR processing error:', err);
      setError(`Failed to process image: ${err.message}. Please try again or enter sets manually.`);
      setIsProcessing(false);
    }
  };

  /**
   * Preprocess OCR text to fix common recognition errors
   */
  const preprocessOcrText = (text) => {
    console.log("Original OCR text:", text);
    
    // Replace common OCR errors with a simpler approach
    let cleaned = text
      // Basic cleanup
      .replace(/[\t\r]+/g, ' ')           // Replace tabs with spaces
      .replace(/\s{2,}/g, ' ')           // Collapse multiple spaces
      
      // Fix common OCR mistakes with times
      .replace(/([0-9])l([0-9])/g, '$1:$2')  // "10l30" -> "10:30"
      .replace(/([0-9])I([0-9])/g, '$1:$2')  // "10I30" -> "10:30"
      .replace(/([0-9]);([0-9])/g, '$1:$2')  // "10;30" -> "10:30"
      
      // Fix AM/PM recognition
      .replace(/\bPM\b/gi, 'PM')  // Standardize PM case
      .replace(/\bAM\b/gi, 'AM')  // Standardize AM case
      
      // Remove status bar content and other UI elements
      .replace(/^[^\n]*\b\d{1,2}:\d{2}\b[^\n]*$/m, '')  // Remove top status bar with time
      .replace(/LINEUP\s*&\s*SCHEDULE/i, '')      // Remove app header
      .replace(/\[\d+[%\]]?/g, '')               // Remove battery indicators
      
      // Add line breaks before key information
      .replace(/\b(\d{1,2})[:.]?(\d{2})\s*(AM|PM)\b/gi, '\n$1:$2 $3')  // Add line break before times
      
      
      // Remove any remaining non-alphanumeric and non-space characters
      // except those used in time formatting and stage names
      .replace(/[^\w\s:.-]/g, '');
    
    // Split into lines, remove empty lines, and trim each line
    let lines = cleaned.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 1);
    
    // Rejoin with newlines
    cleaned = lines.join('\n');
    
    console.log("Preprocessed text:", cleaned);
    return cleaned;
  };

  /**
   * Parse the extracted text to identify artists, times, and stages
   * Uses various regex patterns to match different Festival schedule formats
   */
  const parseSetTimeText = (text) => {
    // Array to store extracted set information
    const extractedSets = [];
    
    console.log('Starting to parse text...');
    console.log('Full text:', text);
    
    // Unified time pattern that handles various formats
    const timePatternStandard = /(\d{1,2})[:.]?(\d{2})\s*(AM|PM)?\s*[-–—]\s*(\d{1,2})[:.]?(\d{2})\s*(AM|PM)?/gi;
    
    // Dynamically infer stage names from OCR text; do not use any known stage list.
    // Stage patterns will be generic, e.g., anything ending with 'Stage', 'Field', 'Grounds', etc.
    const stagePatternStrict = /\b([\w\s'&-]+(?:Stage|Field|Grounds|Meadow|Garden|Valley|pod|Bloom|Jungle|Land))\b/i;
    const stagePatternLoose = /\b([\w\s'&-]{4,25})\b/i;
    
    // Try to extract sets using direct text pattern matching first
    const directExtraction = attemptDirectExtraction(text);
    if (directExtraction.length > 0) {
      console.log(`Direct extraction successful. Found ${directExtraction.length} sets.`);
      return directExtraction;
    }
    
    // Split text into lines and clean them
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line !== '');
    
    console.log('Lines found:', lines.length);
    
    // Use a unified approach to find time patterns in all lines
    let timeMatches = [];
    
    // Create a unified time pattern that can handle various formats
    const unifiedTimePattern = /(\d{1,2})[:.]?(\d{2})\s*(AM|PM)?\s*[-–—]\s*(\d{1,2})[:.]?(\d{2})\s*(AM|PM)?/gi;
    
    // Process each line to find time patterns
    for (let i = 0; i < lines.length; i++) {
      const matches = [...lines[i].matchAll(unifiedTimePattern)];
      if (matches.length > 0) {
        timeMatches.push({ lineIndex: i, matches });
      }
    }
    
    console.log('Time matches found:', timeMatches.length);
    
    // If still no time patterns found, try the direct extraction approach only
    if (timeMatches.length === 0) {
      const directSets = attemptDirectExtraction(text);
      if (directSets.length > 0) {
        console.log(`Direct extraction successful. Found ${directSets.length} sets.`);
        return directSets;
      }
      // If nothing is found, return an empty array (no fallback/demo sets)
      return [];
    }
    
    // Process each time match to find the corresponding artist and stage
    timeMatches.forEach(({ lineIndex, matches }) => {
      // For each time pattern found in this line
      matches.forEach(match => {
        // Extract match groups
        const [, startHour, startMinute, startMeridiem, endHour, endMinute, endMeridiem] = match;
        
        // Look for artist name in surrounding lines
        let artistName = findArtistName(lines, lineIndex, match, timePatternStandard);
        
        // Clean up artist name to remove unwanted characters
        artistName = cleanArtistName(artistName);
        
        // Look for stage name in surrounding lines
        let stageName = findStageName(lines, lineIndex, stagePatternStrict, stagePatternLoose);
        
        // Handle missing meridiem indicators
        let finalStartMeridiem = startMeridiem || 'PM';
        let finalEndMeridiem = endMeridiem || 'PM';
        
        // If only end meridiem is specified, assume same for start
        if (!startMeridiem && endMeridiem) {
          finalStartMeridiem = endMeridiem;
        }
        
        // If start hour is 12 or greater than end hour, adjust meridiem assumptions
        if (parseInt(startHour) >= 12 || (parseInt(startHour) > parseInt(endHour) && parseInt(endHour) < 6)) {
          if (!startMeridiem) finalStartMeridiem = 'AM';
        }
        
        // If end hour is less than start hour and less than 6, assume it's AM (for late night/early morning sets)
        if (parseInt(endHour) < parseInt(startHour) && parseInt(endHour) < 6) {
          if (!endMeridiem) finalEndMeridiem = 'AM';
        }
        
        // Convert hours to 24-hour format using our helper function
        const startHour24 = convertTo24Hour(parseInt(startHour), finalStartMeridiem);
        const endHour24 = convertTo24Hour(parseInt(endHour), finalEndMeridiem);
        
        // Use current date as the base date
        const today = new Date();
        
        // Create start and end times using date-fns
        let startTime = setHours(setMinutes(new Date(today), parseInt(startMinute)), startHour24);
        let endTime = setHours(setMinutes(new Date(today), parseInt(endMinute)), endHour24);
        
        // Handle overnight sets
        if (endTime < startTime) {
          endTime = addHours(endTime, 24); // Add 24 hours to end time
        }
        
        // Add to extracted sets
        extractedSets.push({
          artist: artistName,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          stage: stageName
        });
      });
    });
    
    console.log(`Extraction complete. Found ${extractedSets.length} sets.`);
    return extractedSets;
  };
  
  /**
   * Attempt to directly extract set information based on Insomniac app schedule format
   */
  const attemptDirectExtraction = (text) => {
    const extractedSets = [];
    
    console.log('Attempting direct extraction from Insomniac app format');
    
    // Split the text into lines and clean it up
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line !== '');
    
    console.log('Lines to process:', lines);
    
    // Improved time pattern detection specific to Insomniac format
    const timePattern = /(\d{1,2})[:.]?(\d{2})\s*(AM|PM)/i;
    
    // Track stages to help with context
    let currentStage = '';
    
    // Process each line to find time patterns
    for (let i = 0; i < lines.length; i++) {
      const timeMatch = lines[i].match(timePattern);
      if (timeMatch) {
        console.log('Found time:', lines[i]);
        
        // Extract time components
        const [_, hours, minutes, meridiem] = timeMatch;
        const timeStr = `${hours}:${minutes} ${meridiem}`;
        
        // Look ahead for artist and stage
        let artistName = '';
        let stageName = currentStage; // Use current stage as default
        
        // Scan the next few lines for artist and stage
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const line = lines[j].trim();
          
          // Skip if the line has a time pattern
          if (timePattern.test(line)) continue;
          
          // Check if this is a stage
          if (/\b([\w\s'&-]+(?:Stage|Field|Grounds|Meadow|Garden|Valley|pod|Bloom|Jungle|Land))\b/i.test(line)) {
            stageName = line;
            currentStage = line; // Update current stage
            console.log('Found stage:', stageName);
          } 
          // If not a stage and we don't have an artist yet, assume it's an artist
          else if (!artistName) {
            artistName = line;
            console.log('Found artist:', artistName);
          }
        }
        
        // If we still don't have an artist but have a stage, look backwards
        if (!artistName && stageName) {
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            const line = lines[j].trim();
            if (!timePattern.test(line) && !line.includes('Stage') && line.length > 2) {
              artistName = line;
              console.log('Found artist (backwards):', artistName);
              break;
            }
          }
        }
        
        // If we found either artist or stage, add the set
        if (artistName || stageName) {
          // Convert to 24-hour format using our helper
          const hour24 = convertTo24Hour(parseInt(hours), meridiem);
          
          // Create start time using date-fns
          const today = new Date();
          const startTime = setHours(setMinutes(new Date(today), parseInt(minutes)), hour24);
          
          // End time is typically 1 hour later for festivals
          const endTime = addHours(new Date(startTime), 1);
          
          // Clean up artist name
          const cleanedArtistName = cleanArtistName(artistName || `Artist at ${timeStr}`);
          
          // Add to extracted sets
          extractedSets.push({
            artist: cleanedArtistName,
            start: startTime.toISOString(),
            end: endTime.toISOString(),
            stage: stageName || 'Unknown Stage'
          });
        }
      }
      
      // Also check if the current line contains a stage name to update context
      else if (/\b([\w\s'&-]+(?:Stage|Field|Grounds|Meadow|Garden|Valley|pod|Bloom|Jungle|Land))\b/i.test(lines[i])) {
        currentStage = lines[i].trim();
        console.log('Updated current stage context:', currentStage);
      }
    }
    
    return extractedSets;
  };
  
  /**
   * Find the most likely artist name in the surrounding lines
   */
  const findArtistName = (lines, lineIndex, match, timePattern) => {
    let artistName = '';
    
    // Check the line above
    if (lineIndex > 0) {
      // Skip if the line above just contains a time
      const prevLine = lines[lineIndex-1];
      if (!timePattern.test(prevLine)) {
        artistName = prevLine.trim();
      }
    }
    
    // If no artist found above, check the current line before the time
    if (!artistName && match.index > 0) {
      artistName = lines[lineIndex].substring(0, match.index).trim();
    }
    
    // If still no artist, check nearby lines
    if (!artistName) {
      // Look at surrounding lines for potential artist names
      for (let j = Math.max(0, lineIndex-3); j < lineIndex; j++) {
        if (!timePattern.test(lines[j])) {
          artistName = lines[j].trim();
          break;
        }
      }
    }
    
    // If still no valid artist name, generate one based on the line or use default
    if (!artistName) {
      // Try to extract potential artist name from text
      const potentialLines = lines.filter(line => 
        !timePattern.test(line) && 
        line.length > 3 && 
        line.length < 30
      );
      
      if (potentialLines.length > 0) {
        // Use the line closest to the time as artist name
        const lineDistances = potentialLines.map(line => {
          const lineIdx = lines.indexOf(line);
          return { line, distance: Math.abs(lineIdx - lineIndex) };
        });
        
        // Sort by distance and take the closest
        lineDistances.sort((a, b) => a.distance - b.distance);
        artistName = lineDistances[0].line;
      } else {
        artistName = `Artist at ${match[0]}`;
      }
    }
    
    return artistName;
  };
  
  /**
   * Find the most likely stage name in the surrounding lines
   */
  const findStageName = (lines, lineIndex, stagePatternStrict, stagePatternLoose) => {
    let stageName = '';
    
    // Look in nearby lines for stage name
    for (let j = Math.max(0, lineIndex-3); j <= Math.min(lines.length-1, lineIndex+3); j++) {
      // Try strict pattern first
      const strictMatch = lines[j].match(stagePatternStrict);
      if (strictMatch) {
        stageName = strictMatch[0];
        break;
      }
      
      // If no strict match, try loose pattern
      const looseMatch = lines[j].match(stagePatternLoose);
      if (looseMatch) {
        stageName = looseMatch[0];
        break;
      }
    }
    
    return stageName;
  };
  
  /**
   * Convert hour from 12-hour format to 24-hour format
   */
  const convertTo24Hour = (hour, meridiem) => {
    if (meridiem.toUpperCase() === 'PM' && hour < 12) {
      return hour + 12;
    } else if (meridiem.toUpperCase() === 'AM' && hour === 12) {
      return 0;
    }
    return hour;
  };

  /**
   * Clean artist name by removing unwanted characters
   */
  const cleanArtistName = (name) => {
    return name
      .replace(/[^\w\s&B2b-]/gi, '') // Keep alphanumeric, spaces, &, B2B, hyphen
      .replace(/\s+/g, ' ')          // Replace multiple spaces with a single space
      .trim();
  };

  /**
   * Handle file upload event
   */
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.type.match('image.*')) {
        console.log('File selected:', file.name, file.type, file.size);
        processImage(file);
      } else {
        setError('Please upload an image file (JPG, PNG, etc.)');
      }
    }
  };

  return (
    <div className="mb-6">
      <h3 className="text-edc-blue text-lg mb-2">Upload Set Times from Festival App</h3>
      
      <div className="p-4 border border-dashed border-edc-purple rounded-md text-center">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
          id="set-time-image-upload"
          ref={fileInputRef}
          disabled={isProcessing}
        />
        
        <label 
          htmlFor="set-time-image-upload"
          className={`block cursor-pointer py-3 px-4 bg-gradient-to-r from-edc-purple/30 to-black border-2 border-edc-blue hover:border-edc-pink transition-colors rounded-md ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isProcessing ? 'Processing Image...' : '📷 Upload Screenshot from Festival App'}
        </label>
        
        {isProcessing && (
          <div className="mt-3">
            <div className="w-full bg-black border border-edc-purple rounded-full h-4 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-edc-blue to-edc-pink h-full transition-all" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-edc-purple text-xs mt-1">Extracting set times... {progress}%</p>
          </div>
        )}
        
        {error && (
          <p className="mt-2 text-red-500 text-sm">{error}</p>
        )}
        
        <p className="mt-3 text-white text-sm opacity-75">
          Upload screenshots from the Festival app to automatically import set times.
          <br />
          We'll extract artist names, times, and stages using image recognition.
        </p>
      </div>
      
      {/* Image preview for debugging */}
      {previewSrc && (
        <div className="mt-4 p-3 border border-edc-blue rounded-md">
          <p className="text-edc-blue text-sm mb-2">Image Preview:</p>
          <img src={previewSrc} alt="Uploaded preview" className="max-w-full h-auto rounded-md" />
        </div>
      )}
      
      {/* Debug text output */}
      {debugText && (
        <div className="mt-4 p-3 border border-edc-purple rounded-md">
          <p className="text-edc-blue text-sm mb-2">Extracted Text:</p>
          <pre className="text-white text-xs bg-black p-2 rounded-md overflow-auto max-h-40">
            {debugText}
          </pre>
        </div>
      )}
    </div>
  );
};

export default SetTimeImageUploader;
