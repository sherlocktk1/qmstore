# Scout Dispatch Board v1.1

## Run

```powershell
npm install
npm run dev
```

## v1.1 changes

- Agenda cards accept one or multiple images dragged directly from Windows Explorer.
- Multiple images are stored separately in IndexedDB.
- Agenda cards display a compact photo count.
- Selecting the photo count opens a previous/next gallery.
- File browse remains available in the editor as a backup.
- Tasks 30 minutes or shorter use compact rendering: title only, no location, no schedule-shift controls.
- Tasks longer than 30 minutes show full Agenda content, with the schedule controls on the same top line.
- Minimum scheduled-card height is 18 pixels so 10-minute tasks remain visibly short.

## Excel columns

Item, Location, Detail, Start Time, Duration, Day, Assignment
