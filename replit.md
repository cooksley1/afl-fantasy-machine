# AFL Fantasy Machine

## Overview
A mobile-first Fantasy AFL advisor app providing AI-powered insights, trade recommendations, and strategic intelligence for managing fantasy football teams. Its core purpose is to enhance user decision-making through features like captain loophole strategies, DPP exploitation, break-even analysis, volatility-based projections, Trade EV calculations, late change monitoring, and AI-driven team analysis and scouting reports, automating live data gathering and supporting rolling lockout decision trees.

## User Preferences
- I prefer clear and concise explanations.
- I like to be informed before major architectural changes or significant code refactors.
- I prefer an iterative development approach with regular updates on progress.
- Ensure the application is always mobile-first and responsive.
- I prefer a dark mode for the application interface.
- Do not make changes to files in the `server/services/__tests__/` directory.
- Do not make changes to the `vitest.config.ts` file.

## System Architecture
The application features a mobile-first, responsive design with a custom navy/gold AFL-themed color scheme and dark mode support.

### Authentication
Replit Auth (OpenID Connect) handles authentication for Google, Apple, GitHub, X, and email/password. All API routes, except authentication endpoints, are protected. User sessions are stored in a PostgreSQL `sessions` table.

### Frontend
Built with React, TypeScript, Vite, Tailwind CSS, Shadcn UI, TanStack React Query, and Wouter for routing. Key pages include Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, TeamAnalyzer, PlayerReport, LiveScores, Settings, Admin, and Landing. Player avatars utilize AFL Fantasy API headshots or team-colored placeholders. A 3-step onboarding wizard guides new users through welcome, league settings, and team import options. The application incorporates detailed player availability and selection status logic, providing alerts for injuries, omissions, and emergencies.

### Backend
An Express.js and Node.js server manages API requests, file uploads, and service integrations.

### Database
PostgreSQL with Drizzle ORM stores all application data, including player statistics, projections, user teams, and intelligence reports.

### AI Integration
Utilizes OpenAI GPT-4o-mini for text analysis and GPT-4o for vision and screenshot analysis, leveraging Replit AI Integrations.

### Core Features
- **Projection Engine**: Calculates player projections, volatility, and Trade EV using configurable weights.
- **Simulation Engine**: Provides Monte Carlo simulations for round scores.
- **Trade Engine**: Offers comprehensive trade recommendations based on various factors and phase-specific strategies.
- **Tag Intelligence System**: Provides evidence-based tag warnings by analyzing team tag profiles and historical matchup data.
- **Data Gathering**: Automates fetching live data from Squiggle API, AFL.com.au, and AFL club news feeds.
- **Live Scores**: Tracks live match statuses and fantasy scores, with automated data fetching from Footywire.
- **Season Schedule**: Fetches and displays the full AFL season fixture.
- **Player Data Management**: Loads and reconciles player data, recalculating averages and breakevens.
- **Team Analyzer**: Allows users to upload team screenshots for AI analysis and saving identified players.
- **Trade Optimizer**: Evaluates trades based on Points EV, Price EV, and Strategic EV.
- **Season Planner**: Algorithmically builds optimal 30-man squads and generates comprehensive 24-round strategy documents with player narratives, trade reasoning, and winner benchmarks.

## External Dependencies
- **OpenAI API**: For GPT-4o-mini (text analysis) and GPT-4o (vision/screenshot analysis).
- **Squiggle API**: Provides AFL fixtures, tips, and ladder data.
- **AFL.com.au RSS**: Source for official AFL news.
- **Google News RSS**: Gathers news from all 18 AFL club feeds.
- **AFL Fantasy API**: Used for player headshot photos.
- **DTLive (dtlive.com.au)**: Scraped for player prices, ownership %, and scores.
- **PostgreSQL**: The primary database for all application data.