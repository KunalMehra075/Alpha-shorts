Add this as a **Future Phase: Analytics & Content Intelligence Dashboard** to the project.

---

# Analytics & Content Intelligence Dashboard

After the Upload module is completed, add a comprehensive Analytics and Content Intelligence module.

The purpose of this module is not only to display analytics but also to help make better content decisions.

This module should evolve into the command center of the entire platform.

The system should connect with:

* YouTube Data API
* YouTube Analytics API

and eventually support:

* Instagram
* Facebook
* TikTok
* X (Twitter)

while keeping YouTube as the primary implementation.

---

# Primary Goals

The analytics system should help answer:

* Which videos perform best?
* Which categories perform best?
* Which hook styles perform best?
* Which videos generate subscribers?
* Which upload times perform best?
* Which content should be created next?

The dashboard should not simply report metrics.

It should generate actionable insights.

---

# Dashboard Home

The homepage should act as a content creator command center.

When the dashboard opens, I should immediately understand the health of the channel.

---

## KPI Stat Cards

Display prominent KPI cards:

* Total Views
* Total Subscribers
* Total Likes
* Total Comments
* Total Watch Time
* Total Videos Uploaded
* Average Retention
* Subscriber Growth
* Engagement Rate

Each card should display:

* Current value
* Percentage increase/decrease
* Trend indicator
* Comparison against previous period

Example:

```text
Views
125,400
↑ 12.4% vs last 30 days
```

---

# Channel Growth Analytics

Display a large interactive chart section.

Allow switching between:

* Last 7 Days
* Last 30 Days
* Last 90 Days
* Last 365 Days
* Lifetime

Metrics:

* Views
* Subscribers
* Likes
* Watch Time
* Engagement

Visualization:

* Area Charts
* Line Charts

Users should be able to toggle metrics on/off.

---

# Subscriber Growth Dashboard

Dedicated section for subscriber analytics.

Display:

* Subscribers Gained
* Subscribers Lost
* Net Subscriber Growth

Visualizations:

* Area Chart
* Line Chart
* Monthly Trend Graph

---

# Content Performance Dashboard

Display overall content performance.

Use visual analytics to show:

### Top Categories

Examples:

* Mystery
* Ancient India
* Science
* Technology
* Psychology
* Space
* Business

Display using:

* Donut Charts
* Bar Charts

Example:

```text
Mystery        42%
Science        26%
History        18%
Technology     14%
```

Allow drilling into categories.

---

# Video Performance Table

Display all uploaded videos in a powerful analytics table.

Columns:

* Thumbnail
* Title
* Upload Date
* Views
* Likes
* Comments
* Watch Time
* Average View Duration
* Retention
* Subscribers Gained
* Engagement Rate

Features:

* Search
* Sort
* Filters

Filters:

* Last 7 Days
* Last 30 Days
* Last 90 Days
* Most Viewed
* Most Subscribers Gained
* Highest Retention
* Lowest Performing

---

# Top Performing Content

Display dedicated sections:

### Top Videos By Views

### Top Videos By Retention

### Top Videos By Subscribers Gained

### Top Videos By Engagement

Each section should show:

* Thumbnail
* Title
* Views
* Retention
* Subscribers Gained

---

# Project Analytics Integration

Every uploaded video should remain linked to its project.

Example:

Project:
"Kailasa Temple Mystery"

Inside the project display:

* Views
* Likes
* Comments
* Watch Time
* Retention
* Subscribers Gained
* Engagement Rate

This allows production data and performance data to live together.

Example:

```text
Project

Script
Audio
Captions
Assets
Video
Upload
Analytics
```

---

# Audience Retention Analytics

This is one of the most important features.

Display a dedicated retention dashboard.

Show:

### Retention Curve

Example:

```text
0 sec    100%
5 sec     95%
10 sec    82%
20 sec    61%
30 sec    47%
```

Visualize using:

* Line Charts
* Area Charts

Identify:

* Biggest Drop-Off Point
* Strongest Retention Segment
* Retention Percentage at Key Milestones

The system should help identify where viewers lose interest.

---

# Hook Performance Dashboard

Track the opening hook of every script.

Store:

* First Sentence
* First 3 Seconds
* Hook Category

Examples:

* Question
* Mystery
* Shocking Fact
* Future Prediction
* Contradiction
* Challenge

Analyze:

* Average Retention
* Average Watch Time
* Average Engagement

Display:

* Donut Charts
* Bar Charts
* Ranking Tables

Example:

```text
Mystery Hooks
84% Avg Retention

Question Hooks
78% Avg Retention

Prediction Hooks
65% Avg Retention
```

---

# Engagement Dashboard

Track:

* Likes
* Comments
* Shares (where available)
* Engagement Rate

Display:

* Bar Charts
* Area Charts
* Trend Graphs

Allow filtering by:

* Video
* Category
* Date Range

---

# Upload Time Analysis

Track:

* Day of Week
* Time of Day

Display:

### Upload Heatmap

Example:

```text
Monday     8 PM
Tuesday    9 PM
Friday     7 PM
```

Help identify the best publishing times.

Visualizations:

* Heatmaps
* Performance Grids

---

# Upload Consistency Dashboard

Display publishing consistency.

Show:

### Upload Calendar

Visualize:

```text
✓ Uploaded
✕ Missed
```

for each day.

Track:

* Upload Streak
* Weekly Upload Count
* Monthly Upload Count

Example:

```text
Current Streak:
18 Days
```

---

# Recent Comments Widget

Display latest comments directly inside the dashboard.

Show:

* Profile Image
* Username
* Comment
* Video
* Comment Time

Actions:

* Open Video
* Reply Later
* Mark Important

This should feel similar to an inbox.

---

# AI Insights & Recommendations

Create a dedicated AI-powered insights section.

The AI should analyze:

* Categories
* Retention
* Hooks
* Engagement
* Upload Times
* Subscribers Gained
* Watch Time

Generate insights such as:

```text
Temple-related content gains the highest number of subscribers.

Mystery hooks outperform fact-based hooks by 21%.

Videos between 35 and 45 seconds achieve the best retention.

Videos uploaded between 7 PM and 9 PM receive the highest engagement.

Science videos receive higher average watch time than history videos.
```

The goal is to provide actionable recommendations rather than raw data.

---

# Content Intelligence System

Over time, the dashboard should become a content intelligence platform.

The system should automatically identify:

* Winning Topics
* Winning Categories
* Winning Hook Styles
* Best Video Length
* Best Upload Time
* Best Performing Formats

The AI should continuously help determine what content should be created next.

---

# Future Revenue Dashboard

Prepare architecture for future monetization metrics.

Potential metrics:

* Estimated Revenue
* RPM
* Revenue Trends
* Top Revenue Videos
* Revenue Per Category

Even if revenue is not implemented initially, the architecture should support it later.

---

# Visual Analytics Requirements

The analytics dashboard should feel like a modern SaaS analytics platform.

Inspiration:

* Stripe Dashboard
* Vercel Analytics
* PostHog
* Linear
* Mixpanel
* Plausible

Use modern visualizations:

* KPI Cards
* Area Charts
* Line Charts
* Donut Charts
* Bar Charts
* Heatmaps
* Trend Indicators
* Progress Bars
* Interactive Tables

Recommended libraries:

* Recharts
* Tremor
* ShadCN Charts

---

# User Experience Goals

The Analytics Dashboard should answer the following questions within seconds:

* How is my channel performing?
* Which videos are winning?
* Which categories are winning?
* Which hooks are working?
* What should I create next?
* When should I upload?
* Why did a video succeed or fail?

The final result should feel like a professional business intelligence platform built specifically for YouTube Shorts creators and should eventually become the central decision-making system for the entire content creation workflow.
