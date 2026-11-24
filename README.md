# StudySprint

StudySprint turns pasted syllabus text into a practical study schedule and a short multiple-choice quiz. It includes session check-offs, progress tracking, a copy-plan action, and a responsive accessible interface.

## Run locally

Requires Node.js 20 or newer. No package installation is needed.

```sh
npm start
```

Open [http://localhost:8080](http://localhost:8080).

## AI plans (optional)

Without a key, the server uses a local topic-based planner, so the project works immediately. To enable Gemini generation, set `GEMINI_API_KEY` in the server environment. The key stays on the server and is never sent to the browser.

```sh
GEMINI_API_KEY="your-key" npm start
```

The model can be changed with `GEMINI_MODEL`. The default is `gemini-2.5-flash`.

## Deploy to Cloud Run

Build and deploy the container from this folder:

```sh
gcloud run deploy studysprint --source . --region asia-south1 --allow-unauthenticated
```

To use AI on Cloud Run, set `GEMINI_API_KEY` as a service environment variable or use Secret Manager. Do not commit the key to GitHub.

## Submission checklist

- Push the project to a **public GitHub repository**.
- Deploy the app and open the deployed URL in a private/incognito window to confirm it loads.
- Try the sample syllabus, generate a plan, mark a session complete, and finish the quiz.
- Submit the repository URL and the deployed Cloud Run URL in the event form.

## Notes

- Syllabus and progress are stored in the user's browser using local storage. When Gemini is enabled, the syllabus is sent to Google's Gemini API to generate the plan; the interface explains this when AI mode is active.
- The app limits syllabus input to 12,000 characters and validates request fields on the server.
- AI output is treated as untrusted text and rendered with HTML escaping.
- The local fallback keeps the app usable if the model key is unavailable.
