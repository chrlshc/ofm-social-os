# Claude Code Prompts for Enhanced Content Planning Features

Building on the existing multi-platform **Social OS** (with Temporal workflows, secure webhooks, etc.), we will add advanced content planning features. These include a **content calendar with scheduling** (optimal posting times, approvals) and **AI-driven assistance** for captions/hashtags. A key innovation is leveraging **AI agents in a closed loop** with real performance data – i.e. analyzing top creators' content to inform our strategy. Modern AI marketing approaches already use algorithms to decide *what content to post on which channel and when*, based on data and competitor analysis. Additionally, **content repurposing** is a proven "game-changer" that *multiplies reach without multiplying workload*.

Below are several **highly detailed prompts** to use with Claude Code, each guiding the creation of code for a specific feature. Each prompt provides context and requirements so the AI can produce a **comprehensive code skeleton** for integration into your system. (We use TypeScript/Node.js to fit the existing architecture, with Temporal for workflow orchestration.)

## Prompt 1: Weekly Content Plan & Scheduling Module

*Objective:* Implement a module to **generate a weekly multi-platform content plan** with scheduling and repurposing. This will propose which content to post each day, on which platform, at what time – taking into account **optimal posting times** and content reuse across platforms.

**Context & Constraints:** The Social OS currently supports posting to Instagram (IG), TikTok, X (Twitter), and Reddit via API, with **Temporal** ensuring durable execution and rate-limit compliance. We need to extend it with a **content calendar** feature similar to what major social suites offer (e.g. scheduling, "best time to post" suggestions, approval workflow). Industry research shows that *timing* matters – e.g. TikTok posts perform best on mid-week afternoons, and Instagram often sees highest engagement on weekday evenings. We'll incorporate a simple **"best time" heuristic** per platform (can be refined later). We'll also integrate **content repurposing**: for example, an original video can be formatted and scheduled to post across multiple networks (turning 3 videos into 9 posts, greatly amplifying reach).

**Key Requirements/Features:**

* **Schedule Data Structure:** Define a data model (TypeScript interface or DB schema) for a content plan entry (e.g. `ContentPlanItem` with fields: date, time, platform, contentId or description, status, etc.). This will allow storing and retrieving the weekly schedule.
* **Plan Generation Logic:** A function to generate a weekly plan given inputs (e.g. number of original content pieces per week, target platforms, starting day). It should distribute content evenly (e.g. 3 original pieces -> 1 piece repurposed across 3 platforms each, totaling ~9 posts) and avoid duplication. Include logic to stagger posts at optimal times for each platform (use a simple static mapping for now, e.g. "Instagram – 6 PM; TikTok – 3 PM; Twitter – noon", etc., based on best practices).
* **Repurposing & Variation:** Ensure the same content is not posted to all platforms at the exact same moment – vary timing and format if needed. (For example, if Monday's content is a video, schedule it on TikTok in the afternoon and the repurposed snippet on Instagram in the evening). This simulates manual best practices and *multiplies reach via cross-platform posting*.
* **Approval Workflow (Stub):** Integrate an "approval" status for scheduled items (e.g. a boolean or status field). The code should allow content to be marked as "pending approval" and only actually publish if approved. (Implementing the UI or actual approval mechanism can be a later step; just include the structure.)
* **Temporal Scheduling:** Leverage Temporal to schedule the actual posting actions. For each scheduled item, we can either (a) create a Temporal **Workflow** with a timer to execute the post at the given time, or (b) use Temporal's Cron/Schedule features. (Temporal can schedule workflows like cron jobs, e.g. `"15 8 * * *"` to run daily at 8:15 AM.) In this skeleton, show how a content plan item could be registered with Temporal – perhaps by calling an existing `publish` workflow with a specified delay or cron schedule. Ensure idempotence (so if the system restarts, schedule isn't duplicated).
* **API Endpoint:** Provide an API route (Express.js endpoint) to generate or retrieve the weekly plan. For example, `POST /api/content-plan/generate` to create a new plan for the upcoming week (and schedule the posts), and `GET /api/content-plan?week=YYYY-WW` to fetch it. This allows integration with the frontend calendar view.
* **Logging & Exceptions:** Include logging for plan generation steps (e.g. info logs listing scheduled posts). Handle errors gracefully (e.g. if Temporal scheduling fails or if input data is incomplete). Use the existing logging or monitoring structure to track success (maybe increment a metric for "content_plan_created").

**Prompt 1 – Prompt text to provide to Claude Code:**

```text
You are an experienced TypeScript backend developer working on a content marketing platform. Our system uses Node.js, Express, PostgreSQL, and Temporal for workflow orchestration. 

We need to add a **Weekly Content Plan** feature. Implement the following in **TypeScript** (integrating with our existing code structure):

1. **Data Model**: Define a TypeScript interface (and a corresponding Sequelize or TypeORM model, if using an ORM) for a content plan entry, e.g. `ContentPlanItem`. Include fields: 
   - `id` (UUID or auto-increment primary key),
   - `userId` (to support multi-account),
   - `contentId` or `contentRef` (reference to the original content or campaign),
   - `platform` (enum or string: "instagram" | "tiktok" | "twitter" | "reddit"),
   - `scheduledTime` (DateTime for when to post),
   - `caption` or `text` (string, optional caption to use),
   - `status` (enum: "PENDING" | "SCHEDULED" | "POSTED" | "APPROVED" etc.). 
   Also define a database migration if needed to create a `content_plan` table with these fields.

2. **Plan Generation Function**: Write a function `generateWeeklyContentPlan(userId: string, originalsPerWeek: number, startDate?: Date): ContentPlanItem[]` that creates a schedule for the next 7 days. 
   - Assume `originalsPerWeek` (e.g. 3) is how many original content pieces the user will create this week.
   - The function should schedule each original content piece to multiple platforms (e.g. Instagram, TikTok, Twitter). For example, if 3 originals, spread them across the week (e.g. Mon/Wed/Fri as original content days). For each original, create entries for posting it (or its repurposed variants) on all desired platforms.
   - Stagger posting times based on platform: use a simple hardcoded optimal times map (e.g. TikTok at 4 PM, Instagram at 6 PM, Twitter at 12 PM, Reddit at 10 AM – these are examples). Ensure no two posts of the same content are at the exact same time.
   - Mark all new entries as `PENDING` or `SCHEDULED`. If using approvals, initially mark them as `PENDING_APPROVAL` and include a step to update to `SCHEDULED` once approved (we will handle approval elsewhere, so just note it).
   - Return the list of `ContentPlanItem` (and also save them to the database).

3. **Temporal Integration for Scheduling**: For each generated `ContentPlanItem`, schedule the actual posting action. We have an existing Temporal **Workflow** for publishing posts (assume a workflow `PublishWorkflow` or an activity `publishPost(contentPlanItem)` is already defined). 
   - Use the Temporal client to schedule the publish at the specified `scheduledTime`. For example, you can start a workflow with `workflowOptions` that include `cronSchedule` or calculate a delay. If using Temporal Schedule (new feature) or Cron, set it so that the workflow triggers at `scheduledTime` for that item (one-time). Alternatively, spawn a child workflow with a timer (sleep) until the scheduled time, then call the publish activity.
   - Ensure the scheduling call is idempotent (e.g. use an idempotency key or handle duplicates so we don't double-schedule if the function runs twice).
   - Pseudo-code example (you don't need full Temporal code, just outline): 
     ```ts
     const workflowId = `publish-${contentPlanItem.id}`;
     temporalClient.scheduleWorkflow(PublishWorkflow, { 
       workflowId, 
       scheduleTime: contentPlanItem.scheduledTime, 
       args: [contentPlanItem] 
     });
     ```
     (Use the actual Temporal TypeScript SDK methods appropriately.)

4. **API Endpoints**: 
   - Implement `POST /api/content-plan/generate` which takes parameters like `originalsPerWeek` (and optionally start date or preferences) and calls `generateWeeklyContentPlan` for the authenticated user. Return the generated plan (list of items). This should also trigger the scheduling with Temporal as described.
   - Implement `GET /api/content-plan` which returns the content plan items for the current week (and possibly allow a query param for week or date range). This will fetch from the `content_plan` table for the user, and return a structured response (possibly grouped by day).
   - (If needed, implement `PUT /api/content-plan/:id/approve` to set an item's status to "APPROVED" which could then trigger scheduling; but this can be a stub for now.)

5. **Validation & Logging**: 
   - Validate inputs (e.g. originalsPerWeek <= some max).
   - Use the existing logger to log when a plan is generated (`logger.info("Generated content plan for user ${userId}: ${items.length} items")`). Also log scheduling actions (`logger.info("Scheduled post ${id} on ${platform} at ${time}")`).
   - Catch and log errors. If any scheduling fails, mark that item as failed and perhaps return an error response for the API.

Make sure to integrate seamlessly with our codebase (Node/Express structure, Temporal client usage, and PostgreSQL). Use proper async/await and try/catch for async calls. Return responses in JSON. 

Provide the complete TypeScript code for the new module (data model, functions, and routes), using placeholder values or simplified logic for any parts that depend on external systems. Ensure the code is well-structured and commented for clarity.
```

## Prompt 2: Multi-Platform Social Profile Scraper

*Objective:* Develop a **web scraper module** (or service) to automatically collect **profile data** from successful creators on various platforms (Instagram, TikTok, X/Twitter, Reddit, etc.). This will feed into our system's database to provide examples and benchmarks of "what works" – e.g. profile bios, profile pictures, follower counts, and later their content stats. The immediate goal is to populate a database of top creators' profiles (especially those in niches like lifestyle, fitness, etc., or "girls who succeed on OF/TikTok/Insta") for analysis.

**Context & Considerations:** Scraping social platforms can be complex due to anti-scraping measures and APIs. However, many tools exist to get public profile info without official APIs. For example, there's a popular **TikTok scraper** library that uses TikTok's web API and requires no login. Instagram public profiles can be scraped via web requests or using headless browsers (since Instagram's web HTML includes the bio, follower counts, etc.). Reddit has an official API that can fetch user info and subreddit data easily (or just use JSON endpoints). We should design the scraper to be modular per platform, so it can easily add new sources. Initially, focus on **basic profile data**: username, display name, bio/description, profile picture URL, follower count (if available publicly), and perhaps a category (if the user is a "professional account" on Instagram, a category like "Digital Creator" may appear). We will **not** scrape private data – only what's publicly visible. This data will be stored in a new database table (say `top_profiles`) to later fuel our ML model and content suggestions.

**Challenges:** Ensure to respect rate limits and avoid getting blocked. Use proper delays, user-agent headers, and possibly rotating through tokens or proxies if needed (but keep it simple at first). The system's **rate limiting per token** can help if we use official APIs or our own accounts. Also, design the scraper as a **repeatable workflow** (to refresh data periodically) – we will handle scheduling in Prompt 4 (e.g. daily update). For now, implement the core scraping logic and data persistence.

**Key Requirements/Features:**

* **Platform Modules:** Write separate functions or classes to scrape each platform:
  * *Instagram:* Fetch public profile page (e.g. `https://www.instagram.com/username/` which returns HTML or JSON). Parse out the bio text, profile pic URL, follower count, etc. Possibly use a package or simple regex/DOM parsing (e.g. with Cheerio) on the HTML. Instagram might have a JSON script in the HTML with profile info.
  * *TikTok:* Use an approach such as an unofficial API or a library (e.g. `tiktok-scraper` npm package) to get profile info. The profile URL (`https://www.tiktok.com/@username`) can be fetched – it includes stats like followers and likes count in the HTML. Alternatively, use the library's `getUserProfileInfo(username)` method to retrieve a JSON of profile stats.
  * *Twitter (X):* Public info can be fetched via the Twitter API if we have credentials, or scraped from the user's page HTML (though Twitter (X) now heavily restricts unauthenticated access; if needed, use their API with a bearer token). For now, perhaps focus on IG and TikTok primarily, since those were explicitly mentioned.
  * *Reddit:* Use Reddit's JSON API (e.g. `https://www.reddit.com/user/<username>/about.json`) which returns public profile data including karma, etc. Reddit also might not be the primary focus for "OF girls" but we can include it for completeness.
* **Data Fields:** For each profile, collect at minimum:
  * `platform` (e.g. "instagram"), `username`, `fullName` (if available),
  * `bio` or `description`,
  * `profilePicUrl`,
  * `followersCount` (if available), `followingCount` (if easily available),
  * `postsCount` (for IG), or `likesCount` (TikTok often shows total likes),
  * any "category" or extra info (e.g. Instagram business category, Twitter verified status, Reddit karma).
  * Also timestamp and perhaps `source` (so we know when this data was fetched).
* **Database Integration:** Create a table `top_profiles` (if not exist) with columns for all the above fields plus an `id` and timestamp. The scraper should upsert data (insert new profiles or update if the profile already exists). Use primary key on (platform, username) to avoid duplicates.
* **Scraper Execution Logic:** Implement a function like `scrapeTopProfiles()` that iterates over a list of target usernames or profile URLs. For now, we might hardcode or take from a config a set of "seed" profiles (e.g. a list of well-known successful creators in our domain). The function will call the respective platform scrapers for each and gather the data. Later, this list could be dynamic (from an input or from an API). Focus on making it easy to plug in a new list.
* **Rate Limiting & Errors:** To avoid hitting rate limits, include a short random delay between requests (e.g. `await sleep(1000 + random(0,500)` ms between fetches). Handle network errors or if a profile fetch fails (catch and log, continue with others). If a profile is not found or page layout is unexpected, log a warning.
* **No Credentials Usage:** Use public endpoints where possible. If credentials or API keys are needed (e.g. Twitter API), allow configuring them, but try to get by without for this skeleton (maybe skip Twitter if no easy way without keys).
* **Modularity:** Write the scraper code in a separate module (e.g. `scraper.ts` or a folder with `instagram.ts`, `tiktok.ts` etc.). Keep functions small: e.g. `fetchInstagramProfile(username): Promise<ProfileData>`, `fetchTikTokProfile(username): Promise<ProfileData>`, etc., all returning a unified `ProfileData` object type. Then an orchestrator function to loop through multiple usernames.
* **Testing/Stubs:** For now, you can include a list of example usernames (like popular TikTok/IG stars) to demonstrate the scraper. Use console logging or comments to indicate where the data would be saved to DB (you can simulate the DB save with a function stub `saveProfileToDB(profile: ProfileData)`).

**Prompt 2 – Prompt text to provide to Claude Code:**

```text
You are now tasked with implementing a **web scraper component** in Node.js (TypeScript) for our content marketing platform. This component will gather public **profile information** from various social media platforms (Instagram, TikTok, Twitter/X, Reddit) for top creators. The goal is to feed our database with data on what successful creators are doing (bios, follower counts, etc.), to later inform our AI models.

Implement the following in a new TypeScript module (e.g. `scraper/` directory with relevant files):

1. **ProfileData Type:** Define a TypeScript interface `ProfileData` with fields:
   - `platform: string` (e.g. "instagram", "tiktok"),
   - `username: string`,
   - `fullName?: string`,
   - `bio?: string` (profile biography text),
   - `profilePicUrl?: string`,
   - `followersCount?: number`,
   - `followingCount?: number`,
   - `postsCount?: number` (or `videosCount` for TikTok, etc.),
   - `likesCount?: number` (TikTok total likes),
   - `category?: string` (for IG business profiles or Twitter category if any),
   - `timestamp: Date` (when data was fetched).

2. **Instagram Scraper:** Write an async function `fetchInstagramProfile(username: string): Promise<ProfileData>` that fetches public data for the given Instagram username.
   - Use `node-fetch` or Axios to GET `https://www.instagram.com/${username}/?__a=1` (Instagram supports a query param `__a=1` that returns JSON data for the profile). If that endpoint is unavailable (as Instagram changes often), you can fetch the HTML at `https://www.instagram.com/${username}/` and use a parsing strategy.
   - Parse the JSON or HTML to extract: full name, bio (called `biography` in IG JSON), profile picture URL, follower count (`edge_followed_by.count` in JSON), following count (`edge_follow.count`), and posts count (`edge_owner_to_timeline_media.count`).
   - Return a `ProfileData` object filled with these fields. If any field not found, set it as `undefined`. Handle errors (e.g. if status != 200 or JSON parse fails) by throwing or returning an error result.

3. **TikTok Scraper:** Write an async function `fetchTikTokProfile(username: string): Promise<ProfileData>`.
   - TikTok doesn't offer easy JSON by default, but we can use an unofficial approach. One method: perform a GET request to `https://www.tiktok.com/@${username}` (the user's page). The HTML contains a JSON blob within it (search for a `<script id="SIGI_STATE">` or similar). For simplicity, you might use a regex to find `"followersCount":<number>` etc., or use a library.
   - (Alternatively, if allowed, mention using **tiktok-scraper** library's API e.g. `import { getUserProfileInfo } from 'tiktok-scraper';` – but since we may not actually import here, you can simulate that call.)
   - Extract: nickname (full name), bio (TikTok calls it `signature`), profile pic, follower count, following count, heartCount (likes).
   - Return `ProfileData`. If the page or data not found, handle gracefully (maybe log and return an empty object or error).

4. **Twitter/X Scraper:** Write an async function `fetchTwitterProfile(username: string): Promise<ProfileData>`.
   - **Note:** Twitter (now X) heavily restricts unauthenticated access. If we have an API token, we could call Twitter's API (e.g. `GET users/by/username/:username`). But for this skeleton, implement a placeholder:
   - Attempt to fetch `https://twitter.com/${username}` and parse the HTML for the bio and name (perhaps using a regex for `<meta property="og:description"` which sometimes contains the bio and follower count). This might be unreliable; so in code, comment that a proper API integration or authenticated scrape is needed.
   - Return whatever fields we can (maybe username and a note in bio like "(Twitter data requires API)").

5. **Reddit Scraper:** Write an async function `fetchRedditProfile(username: string): Promise<ProfileData>`.
   - Use Reddit's public JSON: GET `https://www.reddit.com/user/${username}/about.json`. This returns a JSON with fields like `subreddit.public_description` (bio), `subreddit.icon_img` (profile pic), `data.total_karma`, etc.
   - Parse that to get: bio (public_description), profilePicUrl (icon_img), followersCount (called `subreddit.subscribers` for followers of their profile, not always present), and maybe total karma.
   - Return `ProfileData` with available info.

6. **Orchestrator Function:** Implement `async function scrapeProfiles(usernamesByPlatform: Record<string, string[]>)`:
   - The input is an object mapping platform -> list of usernames to scrape. For example: `{ instagram: ["insta_user1", "insta_user2"], tiktok: ["tiktokuser1"], reddit: ["redditUser"] }`. (This could be configured to target specific niches, e.g. popular creators from certain domain.)
   - For each platform, iterate through the usernames list and call the corresponding fetch function (`fetchInstagramProfile`, etc.). Collect the results in an array.
   - After each profile is fetched, **save it to the database**. Implement a helper `saveProfileToDB(profile: ProfileData): Promise<void>` which upserts the record into the `top_profiles` table (e.g. using an ORM or query builder). If using an ORM model, something like:
     ```ts
     await TopProfile.upsert({ platform: profile.platform, username: profile.username, ...other fields });
     ```
   - Include a small delay between each fetch (e.g. `await new Promise(res=>setTimeout(res, 1000))`) to be polite to the servers and avoid rate limits.
   - Use try/catch around each fetch; if one fails, log the error (e.g. `console.error("Failed to scrape ${platform}/${username}: ", err)` ) and continue to next.
   - Return a summary (maybe number of profiles scraped successfully vs failed).

7. **Command or Endpoint:** For testing, you can create a simple script or an API endpoint to trigger this scraper.
   - E.g. an endpoint `POST /api/scrape-profiles` that takes a JSON body of platforms and usernames, then calls `scrapeProfiles` and returns a result summary.
   - Or a CLI script (`npm run scrapeProfiles`) that invokes `scrapeProfiles` with a hardcoded list of popular creators (for example: a couple of top Instagram and TikTok influencer usernames for demonstration).

8. **Logging:** Ensure to log important events:
   - When starting to scrape a profile ("Scraping Instagram profile: userX"),
   - On success ("Fetched profile userX on Instagram: 500k followers, saved to DB"),
   - On error ("Error scraping TikTok userY: <error message>").
   - This helps in monitoring and debugging the scraper.

Make sure the code is well-organized (perhaps separate files for each platform's logic). Use appropriate libraries (e.g. `axios` for HTTP calls, `cheerio` for HTML parsing if needed). Include comments explaining tricky parts (like regex parsing of TikTok HTML). We are looking for a clear **skeleton implementation** that we can later refine with more robust error handling and platform-specific tweaks.
```

## Prompt 3: AI Model Training for Content Strategy Insights

*Objective:* Create a component to **train an AI/ML model** using our collected data (from the scraper and possibly user performance data) to provide content strategy recommendations. This could include **categorizing creators** by style/niche, predicting optimal posting times or content topics, and generating suggestions (e.g. recommending trends to follow or content formats to try). Initially, we focus on a simpler task: **categorize profiles and identify patterns** from the scraped top profiles data, which can then be used to tailor content plans for our users.

**Context & Approach:** We have stored data about top-performing profiles (from Prompt 2). For example, we might have a list of 100 Instagram and TikTok profiles with their bios, follower counts, etc. We want to extract insights:

* Group similar profiles (e.g. "fitness", "travel", "gaming", "adult content", etc.) by analyzing their bios and other info.
* Within each group, maybe derive common patterns like posting frequency or style (in future, if we add scraping of posts).
* Potentially use these groupings to suggest what category a new user fits in, and then suggest content ideas or schedules based on what works for that category.

To do this, we can **train a simple model**:

* Possibly an NLP model that classifies the **bio text** into categories (maybe unsupervised clustering or supervised if we label a few).
* Or use word embeddings (e.g. via a library or simple TF-IDF + KMeans) to cluster the bios.
* Alternatively, a keyword-based approach for now (like if bio contains "fitness, gym, workout" -> category "Fitness").

We should also consider a model to find **optimal post times**. Without historical data, one approach is to use general best practices (from research or scraped observation). In future, the model could learn from engagement data per post (closed-loop on KPIs), but that's beyond initial scope.

For now, focus on building a pipeline that:

1. Prepares training data from the `top_profiles` database (e.g. the bio texts along with perhaps known categories if we manually tag some).
2. Uses an ML library (maybe Python's scikit-learn via a separate script, or a Node.js ML library) to train a model (e.g. a simple classifier or clustering algorithm).
3. Saves the model or its results (e.g. each profile's category or cluster label) back into the system (e.g. add a `category` field in `top_profiles` or a separate table mapping profile -> category).
4. Provides a function to use the model: e.g. given a new user's bio, predict which category they belong to, and maybe use that to fetch relevant best practices (like "most top Fitness influencers post 5x/week and use morning slots").

**Key Requirements/Features:**

* **Data Extraction for Training:** Implement a function to pull the needed data from the DB. For example, `getTrainingData(): Promise<{ bios: string[], labels?: string[]}>`. If we have no predefined labels, we'll do unsupervised clustering; if we decide to create some example labels manually (e.g. label a few profiles by category to seed a supervised model), that could be included.
* **Choice of ML approach:** Since this is a prototype, we can use a simple approach:
  * **Option A: K-Means Clustering** on bio text embeddings. We could use a library to generate text embeddings (maybe a simple bag-of-words vector or TF-IDF from bio text) and then cluster into, say, 5-10 clusters. This will automatically group similar bios. We can then examine clusters and assign them names (this could be manual or algorithmic by looking at top terms).
  * **Option B: Rule-based classification** for now. For example, define a small set of keywords for a few categories (fitness, travel, fashion, etc.) and classify bios if they contain those keywords. Not very robust, but straightforward.
  * **Option C: Use a pre-trained language model** via API (like GPT) to categorize bios, but since we want our own model, we skip external calls.
* **Model Training Implementation:** It might be easiest to do this in Python for practicality (using scikit-learn or similar), but since our environment is primarily Node, we might use a Node library like `natural` or TensorFlow.js. For the skeleton, we can pseudo-code the training steps. For example:
  * Clean the bios text (remove emojis, lower-case, etc.).
  * Vectorize the bios (maybe use TF-IDF via a library).
  * Apply KMeans with a fixed number of clusters, say 5.
  * Print out the top terms for each cluster (to help naming them).
  * Save the cluster assignments for each profile in the DB (e.g. update profile category field or a separate mapping).
* **Using the Model:** Provide a function `suggestContentPlanForUser(userProfile: ProfileData): ContentPlanAdvice` which uses the model results. For example, determine which cluster the user's profile is closest to, and then use the known behavior of that cluster (like if cluster corresponds to "Lifestyle influencers" who post daily on mornings, etc.) to suggest adjustments to their content plan (like "try posting at 7AM, use story-style videos", etc.). This part can be largely rule-based or stubbed since we may not have actual per-cluster behavior yet – but set up the structure for it.
* **Maintainability:** Ensure the training can be re-run easily as new data comes in (so perhaps design it as a script or a function triggered occasionally, see Prompt 4 for scheduling this).
* **Performance:** For now, dataset is small (hundreds of profiles), so no big issues. But mention if using clustering, complexity is okay. If this were larger scale, one might use a more scalable approach or an external service.

**Prompt 3 – Prompt text to provide to Claude Code:**

```text
Our next step is to leverage the data we collected to inform content strategy via an AI model. We need to **train a simple ML model** on the profile data of top creators (from the `top_profiles` table) to categorize content niches or patterns, and then use those insights to guide content planning. 

Implement the following components (you can write this in TypeScript pseudocode or Python – whichever is clearer for the task – but ensure we can integrate the results back into our Node.js system):

1. **Data Retrieval for ML**: Write a function `prepareTrainingData()` that queries the database for relevant data. For example, fetch all entries from `top_profiles`. From each, extract features such as:
   - Bio text (the primary feature for content niche),
   - Possibly the number of followers or other stats (could be features too, e.g. to distinguish mega-influencers vs micro-influencers).
   - If we have any manually labeled categories for some profiles, fetch those as labels. (At this stage, assume no explicit labels – we'll do unsupervised learning.)
   Return a dataset, e.g. an array of bio texts and maybe an array of feature vectors if needed.

2. **Text Vectorization**: Implement a function `vectorizeBios(bios: string[]): Matrix` that converts an array of bio strings into a numeric matrix. 
   - For simplicity, use a TF-IDF vectorization or word count vector. (In Node, we might use a library like `natural` or `wink-nlp` or even call Python's sklearn via an API. But you can pseudo-code it.)
   - Ensure to do some basic text cleanup (remove non-alphanumeric, toLowerCase, etc.) before vectorization.
   - (If coding in Python here, you can use sklearn's `TfidfVectorizer` to get the matrix.)

3. **Clustering Model Training**: Use an unsupervised learning approach to find groups of similar profiles.
   - Use K-Means clustering on the bio vectors. Choose a number of clusters (say 5 for now).
   - Train the KMeans model on the data. After fitting, retrieve the cluster centers and labels for each input.
   - Print or log the top terms for each cluster (to understand what each cluster represents). For example, find the highest TF-IDF features in each cluster center.
   - Store the cluster label for each profile (e.g. update each `top_profiles` entry with a new column `cluster` or `category` indicating which cluster it fell into).
   - (If using Python, you'd use `sklearn.cluster.KMeans`; if Node, perhaps use a simpler approach or skip actual math – but outline it clearly.)

4. **Category Assignment (Post-processing)**: Based on the clustering, assign human-readable category names if possible. 
   - For example, if one cluster's top terms are ["fitness", "gym", "coach"], call it "Fitness". If another has ["travel", "wanderlust"], call it "Travel", etc.
   - You can create a simple mapping or generate names like "Cluster 1", "Cluster 2" if uncertain. But aim to identify a few obvious niches from the data.
   - Update the `top_profiles` records with a `category` field (text) for those identified clusters. (This could be done manually by looking at the top terms for now, but code-wise just demonstrate how we'd assign if we had a mapping.)

5. **Recommendation Function**: Implement `suggestContentStrategy(userProfile: ProfileData): ContentPlanAdvice`.
   - This function takes a new user's profile (or at least their bio and stats) and determines which cluster/category they are closest to.
   - It could do this by vectorizing the user's bio similarly and finding the nearest cluster center (from the trained model) or simply matching keywords.
   - Once a cluster/category is identified, provide a recommendation. We might have a predefined dictionary of advice per category. For example:
     - If category = "Fitness": recommend posting workout videos consistently, using fitness hashtags, best times might be early morning (as many fitness influencers post when audiences are starting their day).
     - If category = "Lifestyle/Travel": recommend high-quality imagery, storytelling captions, and posting during weekends or evenings when audience is relaxing.
     - If category = "Gaming": maybe recommend streaming clips, posting at night when gamers are active, etc.
   - The function should return a structure `ContentPlanAdvice` (with fields like `recommendedPostingTimes`, `recommendedContentTypes`, `notes`). This can be fairly rule-based for now since we don't have detailed data per cluster – the idea is to show how the model insight would be used.
   - For now, just print or log what cluster it chose and some dummy advice text.

6. **Automation**: Write a script or function `trainAndSaveModel()` that ties everything together:
   - Calls `prepareTrainingData()`, then `vectorizeBios()`, then trains the KMeans model.
   - Saves the model (if in Python, perhaps pickle it; if in Node, maybe save cluster centers to a JSON).
   - Updates the database with cluster labels/categories for each profile.
   - This could be run periodically as more data comes in (we'll schedule it in the next prompt, but implement the core logic here).

7. **Note on Tools**: You can pseudo-code or use simple implementations. For example, you might not write a full TF-IDF by hand; just assume that step works. Focus on the integration steps (data in, data out, and how it informs content strategy).

**Provide the code** for the above steps. If using TypeScript entirely, you might not actually perform math – you could integrate a library. If you choose, you can present a Python snippet for the ML part and then show how the Node side would call it or use its output. The goal is a clear skeleton that we can refine into a real model training pipeline.
```

## Prompt 4: Automated Pipeline & System Integration (Scheduling and Stability)

*Objective:* Integrate the above components into the production system in a **stable, automated pipeline**. This involves scheduling the scraper and model training to run periodically (e.g. daily/weekly), ensuring robust operation with monitoring, and tying everything together with our deployment workflow (canary releases, etc.). Essentially, we want the new features to run with the same reliability as existing workflows: use **Temporal** for scheduling, include proper logging/alerts, and ability to roll back if something goes wrong.

**Context & Considerations:** Our ops stack includes **Argo Rollouts** for canary deployments and SLO-based gating, Prometheus/Grafana for metrics. We have a notion of a "canary" where we roll out features gradually (10% -> 50% -> 100%) and monitor certain metrics (p95 latency, error rates, etc.). For these new background processes (scraping and training), we'll treat them as Cron jobs or scheduled workflows. We can first run them in canary mode (maybe scraping only a small set of profiles, or training on a subset) and ensure they meet performance/error SLOs, then ramp up.

**Key Integration Points:**

* **Temporal Scheduled Workflows:** Use Temporal to schedule the **scraper** to run perhaps once a day (or week) and the **model training** to run after scraping or on a schedule. Temporal's Schedule (or Cron) can ensure the job runs even if the service restarts. We should implement a Temporal **Workflow** for `ScrapeAndTrainWorkflow` that encompasses: scraping the profiles then calling the training routine. We can set this workflow to run on a schedule (say every Sunday night for a full refresh, or daily if needed).
* **Workflow Activities:** Inside that workflow, break tasks into activities:
  * `scrapeProfilesActivity` – which calls the code from Prompt 2 (with a set list or pulls target list from config).
  * `trainModelActivity` – which runs the model training from Prompt 3.
  * Possibly a third activity to `updateRecommendationsActivity` – not explicitly separate, but could be combined with train or after train to update any cached recommendations for users.
* **Failure Handling:** Temporal will retry activities on failure by default (with configurable retry policy). Ensure our activities are idempotent or at least safe to retry. E.g., scraping: if it fails mid-way, on retry it might scrape again; that should be fine (maybe it will upsert the same data). Training: if fails, it can just rerun – maybe not a problem. We can also implement checkpoints (e.g. scrape store partial results then continue).
* **Resource Management:** Scraping too often or too much can hit rate limits. Start small (a few profiles) and we can expand later. Perhaps configure how many profiles to scrape per run. Similarly, training frequently is likely fine (data is small), but we could do it weekly.
* **Monitoring:** Add Prometheus metrics or logging around these jobs. E.g., count `scraper_profiles_fetched` gauge or success/failure counts. The mention of *canary SLO gates* suggests we should set up PromQL checks – for example, ensure that the scraper workflow's failure rate is below a threshold before rolling out wide.
* **Ops Console Integration:** The system has an ops console; ensure that important events (like "Scraper run completed" or "Model training completed") are logged or even create an audit event that ops can see.
* **Security & Compliance:** Scraping external sites – ensure we store only necessary data. Possibly avoid storing personal data beyond what's needed (bios are public info; profile pictures – maybe just URL, not downloading images to avoid large PII storage).
* **Rollback Strategy:** If the new features cause issues (e.g. scraper hangs or model training overloads CPU), we should be able to disable them quickly. This could be as simple as a feature flag to turn off the scheduled workflow. We can mention adding a toggle in config (e.g. `ENABLE_SCRAPER=false` to skip scheduling the workflow).

**Key Requirements/Steps:**

* **Temporal Workflow Definition:** Create a new Temporal workflow, e.g. `ScrapeAndTrainWorkflow`, in our TypeScript Temporal worker code. It orchestrates the call to scraping and training activities.
* **Scheduling Setup:** In the initialization code (maybe where we start Temporal workflows), add code to register a schedule. For example, when the service starts, if not already scheduled, start the workflow with `CronSchedule` set to the desired cron string (Temporal can handle persistent cron schedules). For instance, `CronSchedule: "0 0 * * SUN"` for every Sunday midnight, or daily at midnight `"0 0 * * *"`. Document that choice in code comments.
* **Activities Implementation:** Ensure the workflow calls the actual functions from Prompt 2 and 3. This might just be invoking those functions (since our Temporal activities can be just normal functions we register). E.g., in workflow:
  ```ts
  await proxyActivities.scrapeProfilesActivity(targetProfiles);
  await proxyActivities.trainModelActivity();
  ```
  (assuming `targetProfiles` list is defined somewhere or fetched from config).
* **Logging & Metrics:** Within these activities or around them, log the outcome (number of profiles scraped, any errors, time taken, etc.). Possibly push a custom metric (if we have a metrics system, e.g. use Prom Client to push counters).
* **Testing Path:** Possibly provide a way to manually trigger the workflow (for dev). E.g., an API endpoint or CLI command to run `ScrapeAndTrainWorkflow` immediately (for testing new data).
* **Error Notifications:** If a run fails repeatedly, Temporal will eventually give up (or keep retrying depending on policy). We might want an alert. For now, just ensure exceptions are not swallowed – let Temporal mark the workflow failed, which would be visible in Temporal Web UI or trigger an alert if set up.
* **Documentation Comments:** Comment the code to explain schedule frequency and how to adjust it. Also note the feature flag or config, like:
  ```ts
  if (!process.env.ENABLE_SCRAPER) {
      console.log("Scraper workflow disabled by config.");
  } else {
      // schedule it
  }
  ```

**Prompt 4 – Prompt text to provide to Claude Code:**

```text
Finally, integrate the new features into our system with **automated scheduling and robust operations**. Use Temporal for scheduling and ensure the pipeline is reliable. Implement or describe the following:

1. **Temporal Workflow for Scraper+Training**: Define a Temporal workflow (TypeScript) called `ScrapeAndTrainWorkflow`. This workflow will:
   - Invoke the scraper activity to collect profiles (e.g. call `scrapeProfiles()` from Prompt 2's implementation).
   - Then invoke the training activity to update the model (e.g. call `trainAndSaveModel()` from Prompt 3).
   - Wrap calls in try/catch if needed, and log success or error.
   - If an error occurs, let Temporal's retry handle it (configure retry policy if needed, e.g. 3 retries with backoff).
   - Make sure to set appropriate timeouts (maybe each activity has a timeout of e.g. 5 minutes, just to avoid hanging indefinitely).

2. **Schedule Registration**: In the Temporal client setup (probably in our `temporal/client.ts` or wherever we start workflows), add logic to schedule this workflow periodically. Use Temporal's scheduling API or Cron:
   - Example: when the service starts, do:
     ```ts
     await client.scheduleWorkflow({
       workflowType: ScrapeAndTrainWorkflow,
       workflowId: "scrape-and-train-schedule",
       schedule: { cronSchedule: "0 3 * * *" } // every day at 03:00 UTC, for example
     });
     ```
     (The cron expression and times can be adjusted. Maybe use an environment variable or config for frequency.)
   - Include a check to not duplicate schedule if it already exists (Temporal might throw if same ID exists).
   - Alternatively, use Temporal's new Schedule API (if using Temporal v1.18+ with Schedule Beta) for more control – but Cron is fine for now.

3. **Feature Flag for Safety**: Add a configuration flag (e.g. `ENABLE_AUTOMATION`) so that in case of emergencies we can disable the scheduled workflow without redeploying code. For instance, only schedule if `process.env.ENABLE_AUTOMATION !== "false"`. Document this in code comments.

4. **Logging & Monitoring**: Within the workflow and activities, add logs:
   - On start: "Starting ScrapeAndTrainWorkflow run for date XYZ…".
   - After scraping: "Scraped X profiles (Y successes, Z failures)".
   - After training: "Trained model on X profiles, resulting clusters: [list or stats]".
   - On error: "Workflow run failed: <error>".
   Also, consider adding Prometheus metrics (if our system uses it). For example, increment a counter `ofm_scraper_runs_total` and `ofm_scraper_failures_total` for each run, or record duration. (Pseudo-code is fine to indicate where we'd do that.)

5. **Ops Considerations**: Write comments or pseudo-code on how we'd integrate this with our ops:
   - Canary: Initially, we might run this workflow on a small scope. E.g., scrape a small set of profiles (maybe just 10) and train, measure performance. If success over a week, then increase scope (the list of profiles to scrape could be small at first, then expanded).
   - SLO alerts: If the workflow repeatedly fails (e.g. 3 days in a row), we should alert the team. In code, perhaps not implemented, but mention that we'd rely on Temporal's failure metrics or a custom alert (e.g. if `ofm_scraper_failures_total` increases).
   - Rollback: If needed, we can disable the schedule via Temporal CLI or set the feature flag off. We should document how to do that (in a real runbook). For now, just note it in comments.

6. **Combine with Existing System**: Ensure that the new database tables (`content_plan`, `top_profiles`) are part of migrations and have appropriate indices (e.g. index on platform+username for `top_profiles`). Add any needed seed data (maybe some known profiles).
   - Mention any update to the API or UI: e.g., after training, we might show category suggestions in the frontend (not implemented now, but prepared).
   - Also, double-check security: the scraper might run with our server's credentials or no auth; ensure this doesn't expose us to external request vulnerabilities (maybe restrict to known domains, etc.). 

7. **Code Implementation**: Provide the code for:
   - The Temporal workflow definition (likely in `marketing/backend/api/src/temporal/workflows/` directory).
   - Registration of the workflow schedule in the setup (maybe in an init script or when starting the worker).
   - You can pseudo-code parts like the actual call to our earlier functions (assuming they are imported).
   - Include comments for any configuration (cron timing, feature flag, etc.).

Make sure the code is clean and commented, demonstrating how these pieces tie together for a robust scheduled pipeline.
```