# SmartShelf Merged Library Management System

This build combines the three supplied projects using the requested priority rules.

## Merge rules used
- `style.css` and the dark/light theme logic are preserved from `SmartShelf_project`.
- Wishlist behavior and its heart-button UI are preserved from `files_project`.
- The expanded catalog and Student / Librarian / Staff role flow come from `fee project`.
- New add-ons were implemented separately in `enhancements.css` and the shared JavaScript.

## Added features
- Live availability based on active loans
- Reserve unavailable books and cancel reservations
- Smart alerts for due-soon, overdue, and newly available reserved books
- Personalized recommendations
- Recently viewed books
- Adjustable reading goal with progress

## Run
Open `index.html` in a browser. For the most reliable local behavior, serve the folder with a simple local server.

Example with Python:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000`.

## Librarian demo account
- Email: `admin@admin.smartshelf`
- Password: `admin123`
- Choose **Librarian** on the sign-in screen.

Student and Staff accounts can be created from the sign-up page.

## JavaScript functionality upgrade
This version makes JavaScript the main functional layer of SmartShelf instead of using it only for basic interactions.

### New working JavaScript features
- Search autocomplete with live book suggestions
- Dynamic catalog search, filters, sorting and result counts
- Borrow / return logic with live copy availability
- ₹5-per-day overdue fine calculation with dashboard totals
- FIFO-style reservation queue with queue positions and ready-to-borrow alerts
- Student ratings and reviews stored in localStorage, with live average ratings
- Borrowing-history filters for returned, all and overdue records
- Smart dashboard alerts for due-soon, overdue, fines and reservation readiness
- Personalized recommendations and recently viewed history
- Adjustable reading-goal progress
- Admin live search and genre filtering
- Admin analytics for active loans, overdue loans, outstanding fines, most-borrowed title and top genre
- Client-side validation for catalog edits

All new state is persisted through localStorage so the functionality survives page refreshes in the same browser profile.


## SmartShelf v2 JavaScript Enhancements

New interactive features added for the final submission:
- Promises in three visible workflows: asynchronous catalog loading, borrowing, and dashboard Promise.all loading.
- Voice search (Web Speech API; supported browsers such as Chrome/Edge).
- Book comparison for 2–3 selected catalog titles.
- Ctrl/Cmd + K command palette.
- Undo for wishlist changes.
- Auto-saved review drafts.
- Reading activity streak and achievement badges.
- Surprise Me preference-aware random book picker.
- Last five recent searches.
- Admin catalog activity log with timestamps.
- Existing JavaScript upgrades remain: overdue fines, reservation queue, ratings/reviews, autocomplete, dashboard history filters, and admin analytics.
