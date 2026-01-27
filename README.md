# Touchline

Create a soccer event tracking web app with the following sections:
1. Video Player Section:

File upload input to load a local video
HTML5 video player with play/pause and seek controls
Display current video timestamp

2. Soccer Pitch Section:

Display a static soccer pitch diagram (top-down view)
User can click anywhere on the pitch to mark event location
Show a visual marker at the clicked location
Pitch should be properly scaled and proportioned

3. Event Recording Panel:

Grid of clickable player buttons (numbered 1-11 for each team, 22 total)
List of event type buttons: Pass, Shot, Tackle, Dribble, Clearance, Foul, Corner, Free Kick
"Record Event" button that saves the current selection

4. Event Log Section:

Scrollable list displaying all recorded events
Each entry shows: video timestamp, player number, event type, X/Y coordinates
Delete button for each event entry

5. Data Management:

Store events in browser localStorage
"Export to CSV" button that downloads a CSV file with columns: Timestamp, Player, Event Type, X Coordinate, Y Coordinate
Clear all events button

Design: Clean, functional layout with all sections visible on one screen. Use a professional sports analytics color scheme (#001E44 / #041E42 / White). Make buttons large enough for quick clicking during live tracking.
