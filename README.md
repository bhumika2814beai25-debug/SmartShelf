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
