function MyStoryPage({ onExit }) {
  return (
    <section className="story-page card" aria-label="My Story About the App">
      <div className="story-header">
        <p className="story-eyebrow">About the Developer</p>
        <h2>My Story About the App</h2>
        <p>
          Hi, I am Grant, a Canadian developer with a lifelong passion for music and dance.
          Rhythm has always shaped how I learn, build, and think about experiences.
        </p>
      </div>

      <div className="story-section">
        <h3>How BrushBeats Started</h3>
        <p>
          BrushBeats started with a very practical problem: traditional toothbrush timers often
          felt out of tempo with real brushing movement. That mismatch made routines feel flat,
          rushed, or repetitive.
        </p>
        <p>
          I wanted a better pacing system, one that feels musical and natural. The result is a
          rhythm-based, beat-guided brushing experience where timing adapts to the selected tooth
          count and brushing duration.
        </p>
      </div>

      <div className="story-section">
        <h3>What I Build Around</h3>
        <p>
          My background combines data-driven systems, interactive web apps, and music timing
          workflows. I enjoy exploring how pacing, accessibility, and real-time feedback can make
          everyday routines easier to stick with.
        </p>
      </div>

      <div className="story-section">
        <h3>Future Vision</h3>
        <p>
          I believe great software is never built in isolation. It is a collaborative journey with
          real users who share what works and what needs improvement.
        </p>
        <p>
          If you are an early adopter, I would love your feedback. In return for your insights,
          early adopters will keep lifetime free access while we shape the platform together.
        </p>
        <p>
          Want to reach me directly? Email <a href="mailto:canadianwindrider@gmail.com">canadianwindrider@gmail.com</a>.
        </p>
        <p className="story-closing">Still building. Still experimenting. Built on rhythm.</p>
      </div>

      <div className="story-actions">
        <button type="button" className="action-btn" onClick={onExit}>
          Return to brushing flow
        </button>
      </div>
    </section>
  );
}

export default MyStoryPage;
