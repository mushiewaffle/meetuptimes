// Script to remove help buttons from App.jsx
import fs from 'fs';

// Path to App.jsx
const appPath = '/Users/kevinwu/CascadeProjects/meetuptimes/src/App.jsx';

// Read the file
let content = fs.readFileSync(appPath, 'utf8');

// 1. Remove the showInstructions state variable
content = content.replace(
  /const \[showInstructions, setShowInstructions\] = useState\(false\);/g,
  '// Help button state removed'
);

// 2. Remove the help button click outside handler
content = content.replace(
  /\/\/ Handle clicking outside the instructions popup\s+useEffect\(\(\) => \{\s+if \(showInstructions\) \{\s+const handleClickOutside[^}]*}\s+\}, \[showInstructions\]\);/gs,
  '// Help button click outside handler removed'
);

// 3. Remove all help buttons and their popups
// Function to remove a help button and its associated popup
function removeHelpButton(content) {
  const pattern = /<div className="relative">\s*<button\s+onClick={\(e\) => {\s*e\.stopPropagation\(\);\s*setShowInstructions\(!showInstructions\);\s*}}\s*className="[^"]*help-button"[^>]*>\s*\?\s*<\/button>\s*{showInstructions && \(/gs;
  
  // Find all matches
  let matches = [...content.matchAll(new RegExp(pattern, 'g'))];
  
  // Process each match
  for (const match of matches) {
    const startIdx = match.index;
    let nestLevel = 1;
    let endIdx = startIdx + match[0].length;
    
    // Find the closing div by balancing tags
    for (let i = endIdx; i < content.length; i++) {
      if (content.substring(i, i+5) === '</div') {
        nestLevel--;
        if (nestLevel === 0) {
          endIdx = i + 6; // Include the closing tag
          break;
        }
      } else if (content.substring(i, i+4) === '<div') {
        nestLevel++;
      }
    }
    
    // Replace this specific help button and popup
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx);
    content = before + '{/* Help button removed */}' + after;
    
    // Reset matches after modifying content
    matches = [...content.matchAll(new RegExp(pattern, 'g'))];
    if (matches.length === 0) break;
  }
  
  return content;
}

// Apply the help button removal
content = removeHelpButton(content);

// 4. Clean up any remaining references to showInstructions
content = content.replace(/setShowInstructions\(!showInstructions\);/g, '// Help button code removed');
content = content.replace(/{showInstructions && \([^}]*}\)}/gs, '{/* Help button popup removed */}');

// Write the modified content back to the file
fs.writeFileSync(appPath, content);

console.log('Help buttons removed successfully!');
