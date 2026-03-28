// Postcode search input and button

// Receives three props from Sidebar
//   onSearch — function to call when the user submits a postcode
//   isLoading — disables the button and changes its label while a search is running
//   error — error message string to display below the input if a search fails

import { useState } from 'react';

export default function SearchBar({ onSearch, isLoading, error }) {
  // Tracks what  user has typed in the input field
  const [value, setValue] = useState('');

  
  function handleSearch() {
    if (value.trim()) onSearch(value.trim());
  }

  //allows the user to submit by pressing enter
  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch();
  }

  return (
    <div id="search-section">
      <div id="search-row">
        {/* Controlled input — React owns the value via useState rather than the DOM */}
        <input
          id="postcode-input"
          type="text"
          placeholder="Enter postcode (e.g. LU3 1BB)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {/* Button is disabled while loading to prevent duplicate requests */}
        <button id="search-btn" onClick={handleSearch} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Search'}
        </button>
      </div>
      {/* Only renders the error message if one exists */}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
