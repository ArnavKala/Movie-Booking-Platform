# Movie Booking Backend

BookMyShow-style REST API: Node.js, Express, MongoDB Atlas (Mongoose), JWT auth. The connected customer frontend is in `../movie-hub` (see its README for local proxy and deployment setup).
Architecture: **Routes → Controllers → Services → Models** (`src/`).

## Prerequisites
- Node.js 18+ (developed for Node 24), npm
- A MongoDB Atlas cluster (free M0 works; it is a replica set, so transactions are supported)

## Install & configure (Windows)
```cmd
npm install
copy .env.example .env
```
PowerShell: `Copy-Item .env.example .env`. Then edit `.env`:

| Variable | Meaning |
|---|---|
| `PORT` | HTTP port (default 5000) |
| `MONGODB_URI` | Atlas connection string, e.g. `mongodb+srv://USER:PASSWORD@cluster0.xxxx.mongodb.net/movie_booking?retryWrites=true&w=majority` (include a database name) |
| `JWT_SECRET` | Long random string. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `NODE_ENV` | `development` / `production` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for admin movie uploads |
| `CLOUDINARY_API_KEY` | Cloudinary upload API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret; keep this backend-only |
| `CLOUDINARY_FOLDER` | Optional folder for uploaded movie assets (default `goodshow/movies`) |

### MongoDB Atlas setup
1. Create a free cluster at https://cloud.mongodb.com.
2. **Database Access** → add a database user (username + password; URL-encode special characters in the password).
3. **Network Access** → add your current IP (or `0.0.0.0/0` for development only).
4. **Connect → Drivers** → copy the connection string into `MONGODB_URI` and set the database name after the host.

## Run
```cmd
npm run dev          # nodemon, auto-reload
npm start            # production
npm run create-admin -- admin@example.com "StrongPass123" "Admin Name"
```
Registration always creates `USER` accounts; use `create-admin` to create or promote the first ADMIN.
Health check: `curl http://localhost:5000/api/health`

Configure Cloudinary to upload movie posters and trailers from Admin → Movies. The backend signs short-lived uploads at `GET /api/admin/uploads/signature`; the browser uploads directly to Cloudinary, so media files do not pass through the API server. Never put `CLOUDINARY_API_SECRET` in the frontend or a `VITE_*` variable.

Restart the backend after changing any Cloudinary value in `.env`; environment variables are read when Node starts. If Cloudinary reports `Invalid Signature`, verify that the cloud name, API key, and API secret all come from the same Cloudinary account and that there are no extra spaces. Rotate the API secret immediately if it has been exposed.

## Tests
```cmd
npm test
npm run test:frontend
```
Tests use `mongodb-memory-server` (in-memory **replica set**, because transactions need one). The first run downloads a MongoDB binary (needs internet). To use a separate Atlas test cluster instead, set `TEST_MONGODB_URI` (a unique throw-away database is created and dropped). Tests never use `MONGODB_URI`.

`npm run test:frontend` runs the isolated browser smoke test in `scripts/test-frontend.cjs`. It uses a temporary MongoDB replica set, starts the API and Vite, launches Chrome through the declared Playwright dev dependency, and uses a test-only payment-provider double. Set `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`.

## Response format
```json
{ "success": true, "message": "...", "data": {}, "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
{ "success": false, "message": "Validation failed", "errors": [{ "field": "email", "message": "..." }] }
```
Status codes: 200/201 success, 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict (duplicates, seat already booked, blocked deletes), 500 unexpected.
Send `Authorization: Bearer <token>` for protected routes. List endpoints accept `page` and `limit`.

## API
Auth: 🔓 public · 🔑 any logged-in user · 🛡️ ADMIN.

**Health & Auth** — `GET /api/health` 🔓 · `POST /api/auth/register` 🔓 `{name,email,password,phone?}` · `POST /api/auth/login` 🔓 `{email,password}` · `GET /api/auth/me` 🔑

**Users** — `GET|PUT|PATCH /api/users/me` 🔑 (name, phone) · `PUT /api/users/me/password` 🔑 `{currentPassword,newPassword}`

**Movies** — `GET /api/movies` 🔓 (`q, genre, language, status, sortBy, order`) · `GET /api/movies/:id` 🔓 · `POST /api/movies` 🛡️ · `PUT|PATCH /api/movies/:id` 🛡️ · `DELETE /api/movies/:id` 🛡️ (409 if it has shows)

**Theatres** — `GET /api/theatres` 🔓 (`q, city, facility, isActive, lat+lng+radiusKm`) · `GET /api/theatres/:id` 🔓 (includes screens) · `POST` / `PUT|PATCH /:id` / `DELETE /:id` 🛡️. Location is sent as `{"latitude":..,"longitude":..}` and stored as GeoJSON.

**Screens** — `GET /api/screens` 🔓 (`theatre`) · `GET /api/screens/:id` 🔓 · `POST /api/screens` 🛡️ `{theatre,name,screenType?,layout?}` · `PUT|PATCH /api/screens/:id` 🛡️ · `PUT /api/screens/:id/layout` 🛡️ · `DELETE /api/screens/:id` 🛡️
`layout` example: `[{"row":"A","count":10,"category":"REGULAR"},{"row":"B","count":8,"category":"PREMIUM"},{"row":"C","count":4,"category":"RECLINER"}]`. Replacing a layout is only allowed while the screen has no shows.

**Seats** — `GET /api/seats?screen=<id>` 🔓 (`category, isActive`) · `GET /api/seats/:id` 🔓 · `POST /api/seats` 🛡️ `{screen,row,number,category}` · `POST /api/seats/bulk` 🛡️ `{screen,seats:[...]}` · `PUT|PATCH /api/seats/:id` 🛡️ · `DELETE /api/seats/:id` 🛡️ (blocked while a confirmed booking exists for an upcoming show)

**Shows** — `GET /api/shows` 🔓 (`movie, theatre, screen, city, date=YYYY-MM-DD, tzOffset, from, to, status, language, format, upcoming`) · `GET /api/shows/:id` 🔓 · `GET /api/shows/:showId/seats` 🔓 (per-show availability) · `POST /api/shows` 🛡️ `{movie,theatre,screen,startTime,prices:{REGULAR,PREMIUM?,RECLINER?},language?,format?}` · `PUT|PATCH /api/shows/:id` 🛡️ · `DELETE /api/shows/:id` 🛡️
`date` is a UTC day unless `tzOffset` (minutes ahead of UTC, e.g. `330` for IST) is given. Missing PREMIUM/RECLINER prices default to 1.5×/2× REGULAR. `endTime` is computed from the movie duration. Setting `status: "CANCELLED"` cancels the show and all its confirmed bookings.

**Payments** (🔑) — `POST /api/payments/orders` `{showId,seatIds:[...],requestId:<UUID v4>}` (max 10 seats; server-calculated INR amount) · `POST /api/payments/verify` `{checkoutId,razorpay_order_id,razorpay_payment_id,razorpay_signature}` · `POST /api/payments/:id/reconcile` · `GET /api/payments`. `POST /api/payments/webhook` accepts only valid Razorpay raw-body signatures.

**Bookings** (🔑) — `GET /api/bookings` (own history, `status`) · `GET /api/bookings/:id` · `DELETE /api/bookings/:id` `{reason?}` (cancel and queue a full refund). The former `POST /api/bookings` returns 402; confirmed bookings are created by verified captured payments only.

**Tickets** — `GET /api/tickets/:bookingId` 🔑 returns the paid booking, signed token, scan URL and PNG QR data URL · `GET /api/tickets/:bookingId/pdf` 🔑 downloads a PDF · `POST /api/tickets/validate` 🛡️ `{token}` · `POST /api/tickets/check-in` 🛡️ `{token}`. Tokens or scanned URLs are accepted. Check-in is allowed from two hours before the show through its end, once per booking.

**Admin** (🛡️) — `GET /api/admin/stats` · `GET /api/admin/users` (`q, role, isActive`) · `GET|PATCH|DELETE /api/admin/users/:id` (PATCH `{role?,isActive?}`) · `GET /api/admin/bookings` (`status,user,show,from,to`) · `GET|DELETE /api/admin/bookings/:id`. Movies, theatres, screens, seats and shows are managed through their own endpoints above (write operations are ADMIN-only).

## How double booking is prevented
- Seats are physical only (`Seat`); availability is derived per show from `Booking` documents with `status = CONFIRMED`.
- `Booking` has a **partial unique multikey index** on `{ show, seats }` where `status = "CONFIRMED"`. MongoDB itself refuses a second confirmed booking containing the same seat for the same show, however requests interleave. Indexes are built at startup (`Model.init()`) before the server accepts traffic.
- Booking creation runs in a **transaction** (snapshot read, majority write; works on Atlas). Writers that collide get a transient write conflict, are retried, then see the seat taken and receive `409`. The bookings are all-or-nothing.
- Totals are computed from the show's prices; client-supplied prices are ignored.
- Cancelling updates only that booking, conditionally on `status = CONFIRMED`. Seats are freed implicitly (that booking leaves the index), so it can never release seats held by a different booking, and a repeated cancel returns `409`.

## Known limitations
- Overlap detection for shows on one screen is a check-then-insert (exact same start time is protected by a unique index; two admins creating *partially* overlapping shows at the exact same moment could both succeed).
- Razorpay test-mode checkout is integrated. See `../movie-hub/README.md` for payment, webhook, refund, QR/PDF ticket, and admin setup. The legacy `POST /api/bookings` endpoint returns 402; use `POST /api/payments/orders` and verify checkout through `POST /api/payments/verify`.
- `MONGODB_URI` must point to a replica set (Atlas always is). A standalone local `mongod` cannot run transactions.
