# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Facilitators and contributors estimating work together as a team, including but not limited to scrum masters and developers. The existing interface uses Scrum Master and Developer role labels.

## Product Purpose

Help teams estimate a list of stories through individual votes, discussion, and a facilitator-finalized score. Success means the team can work through its stories and record an agreed estimate for each one.

## Operating Context

Intended for real team use during collaborative estimation sessions. A facilitator names a session, specifies the contributor count, pastes one story per line, and shares the contributor panel link. Contributors identify themselves by voter number and estimate the active story. The facilitator also votes, reviews the results once everyone has voted, records the final score, and advances to the next story.

The existing local development workflow uses `npm start` for the React app at `http://localhost:3000` and `node server.js` for the Express backend, defaulting to port 5001.

## Capabilities and Constraints

- Story lists show the active story, voting status, and finalized story scores.
- Contributor votes remain hidden in the facilitator interface until all expected contributors and the facilitator have voted.
- Differing estimates prompt discussion; the facilitator manually enters the final score.
- The current implementation uses React, React Router, styled-components, and an Express backend.
- The backend currently stores one shared story list and vote collection in process memory. Session names in routes do not isolate backend data, and backend state is lost on restart. These are implementation limitations, not intended requirements for real team use.
- Shared contributor links currently use localhost. Deployment, durable storage, session isolation, and access-control requirements remain open decisions.

## Brand Commitments

The existing product name is Scrum Poker Planning, with Scrum Poker used in the interface. No additional brand or voice commitments are established.

## Evidence on Hand

- `README.md` describes the application and local setup.
- `src/App/pages/AddStoryList/index.js` implements session setup and newline-separated story entry.
- `src/App/pages/ViewPlanningAsScrumMaster/index.js` implements facilitation, vote visibility, final scoring, and story progression.
- `src/App/pages/ViewPlanningAsDeveloper/index.js` implements contributor estimation.
- `server.js` implements the in-memory story and vote endpoints.

No distinctive positioning, customer proof, benchmarks, pricing, or product-specific accessibility requirements have been confirmed. Do not invent these claims.

## Product Principles

- Serve team estimation beyond formal scrum roles.
- Preserve individual estimation before group discussion.
- Keep the facilitator responsible for the agreed final score.
- Distinguish intended real-team use from current local implementation limitations.
