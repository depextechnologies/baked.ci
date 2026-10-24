# Auth testing (Emergent-managed Google, native app)
- App login screen: /api/app-preview/login. "Continuer avec Google" redirects to https://auth.emergentagent.com/?redirect=<origin + current path>.
- After Google, user returns to /login#session_id=...; app POSTs /api/auth/emergent/session {session_id} → {access_token, customer} (same JWT as OTP).
- Real Google sign-in cannot be automated; test that the redirect URL is correct and that /api/auth/emergent/session returns 401 for an invalid session_id.
- Phone OTP: +225700000000 → dev_code is returned in /auth/otp/request (dev env).
