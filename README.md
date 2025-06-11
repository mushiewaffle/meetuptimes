# Festival Meetup App

A neon-themed single-page web application that helps up to 5 friends at a music festival coordinate meetup times during overlapping downtime between their preferred artist set schedules.

## Optimized Meetup Planning

The app has been fine-tuned to provide the most effective meetup coordination experience with these key features:

- **15-Minute Meetups**: All suggested meetups are exactly 15 minutes long for quick and efficient meetups
- **Best Time Selection**: Advanced algorithm prioritizes and ranks the optimal meetup times
- **Customizable Results**: Users specify how many meetup suggestions they want (1-6)
- **Everyone-First Priority**: Times when all friends are free get highest priority
- **Smart Location Selection**: Meetup spots are automatically assigned to landmarks near scheduled sets
- **Location Preferences**: Optionally specify a preferred landmark for all meetups

## Features

- **Friend Management**: Add up to 5 friends with their set schedules
- **Set Schedule Input**: Input artist names and set times
- **Meetup Suggestion**: Automatically identifies overlapping downtime periods (minimum 30 minutes)
- **Offline Support**: Full offline functionality via Service Worker
- **Data Persistence**: Saves all data to LocalStorage
- **Responsive Design**: Mobile-first design for easy use at festivals
- **Festival Aesthetic**: Vibrant neon colors and animations inspired by music festivals

## Technology Stack

- **Frontend**: React 18
- **Styling**: Tailwind CSS with custom festival neon theme
- **Build Tool**: Vite
- **Date/Time Handling**: date-fns
- **Animations**: react-spring
- **Offline Support**: Service Worker via vite-plugin-pwa
- **Storage**: LocalStorage

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd edc-meetup-app

# Install dependencies
npm install

# Start development server
npm run dev
```

## Usage

1. Add friends by entering their names
2. For each friend, add the sets they plan to attend by providing:
   - Artist name
   - Set start time
   - Set end time
3. Click "Find Meetup Times" to calculate potential meetup slots
4. View suggested meetup times with all or subsets of friends
5. All data is saved automatically to your browser's LocalStorage

## Build for Production

```bash
npm run build
```

This will create a production-ready build in the `dist` directory that can be deployed to any static hosting service like Netlify.

## Offline Functionality

The app includes a Service Worker that caches all assets, making it fully functional without internet connectivity. This is especially important in festival environments where signal may be limited.

## Algorithm

The app uses an interval intersection algorithm to:
1. Convert set schedules to time intervals
2. Identify gaps between sets for each friend
3. Find intersections of downtime across friends
4. Filter for slots that are at least 30 minutes long
5. Generate meetup suggestions with default landmarks

## Design

The UI features a festival-inspired neon aesthetic with:
- Vibrant pink (#FF00FF), blue (#00FFFF), and purple (#8000FF) colors
- Black background with subtle gradient effects
- Glow effects on buttons and text
- Orbitron font for that futuristic festival feel
- Smooth fade-in animations via react-spring

## License

MIT
