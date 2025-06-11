import React from 'react';

/**
 * VenmoTipJar component that displays a subtle link to send the developer a tip via Venmo
 * Mobile-friendly and seamlessly integrated into the app
 */
const VenmoTipJar = () => {
  // Handle Venmo link for both mobile and desktop
  const openVenmo = (e) => {
    e.preventDefault();
    
    try {
      // Venmo username
      const venmoUsername = 'kevin-wu-86';
      
      // Default message about supporting the app
      const message = encodeURIComponent('Thanks for Festival Meetup Times Planner! 🎵🎉');
      
      // Create the Venmo URL - works on both mobile and desktop
      const venmoUrl = `https://venmo.com/${venmoUsername}?txn=pay&note=${message}`;
      
      // Open in a new tab with secure parameters
      window.open(venmoUrl, '_blank', 'noopener,noreferrer');
      
      // No fallback redirection - only open in new tab
    } catch (err) {
      // Log error but don't redirect
      console.error('Error opening Venmo:', err);
    }
  };

  return (
    <div className="venmo-tip-jar opacity-90 hover:opacity-100 transition-opacity mb-0 text-center">
      <p className="text-xs text-white/70 mb-1" data-component-name="VenmoTipJar">
        Feeling PLUR?
      </p>
      <button 
        onClick={openVenmo}
        className="text-edc-blue hover:text-edc-pink transition-colors inline-flex items-center text-sm"
        aria-label="Support the developer on Venmo"
      >
        <svg className="inline-block w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="#3D95CE" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M17.0214 1C19.0135 1.67936 20.5502 3.33031 21 5.38998C21 9.94211 18.1821 15.5973 14.7712 20H6L3 3.49928L9.5 3.03833L11.2384 12.3624C12.4569 9.75044 13.5988 6.34416 13.5988 4.17241C13.5988 3.03833 13.3691 2.17395 13.062 1.58774L17.0214 1Z" />
        </svg>
        <span data-component-name="VenmoTipJar">Support the site </span>
        <span className="ml-1">❤️</span>
      </button>
    </div>
  );
};

export default VenmoTipJar;
