# Jury demo script (60–90 seconds)

**Setup before you go on stage:** start the backend and frontend. Clear old demo projects if you want a clean list. Open http://localhost:5173 in a 1440px-wide window. For the optional live-AI coda, have one Path B project already analyzed, because local models take minutes.

---

### Scene 1: Reality (0:00–0:12)
- On the homepage hero, let the animation run once: a rental counter is recorded, structure is detected, and the app assembles.
- Say: *"Every business already has a specification. It's the way people actually work. We start there."*
- Click **Experience the Demo**.

### Scene 2: Structure (0:12–0:28)
- The workspace opens. Point to the label: *"This is a predefined sample, clearly marked. Real uploads go through the same screens with a local model."*
- Press play on the storyboard. Point at the entities that were found: Customer, Item, Rental.
- Click the rule **"An unavailable item cannot be rented."** The transcript highlights 00:09, where the clerk says it.
- Say: *"Every rule is traceable back to the moment it was observed."*

### Scene 3: Human verification (0:28–0:42)
- Click **Confirm 26 with evidence**. Then **Verify & approve**.
- Point to the AI inferences that are left. **Reject** "Late returns may incur a fee" because nobody said that, and confirm the rest.
- Say: *"The AI proposes. A person decides. Rejected ideas never reach the software."*
- Click **Approve workflow**.

### Scene 4: Compilation (0:42–0:55)
- Click **Compile Application**. The compiler core lights up layer by layer, the stages report real measurements, and the assembly panel shows navigation, data models, forms and rules.
- Say: *"No code is generated. The approved definition compiles into a manifest for a safe runtime."*
- Click **Open application**.

### Scene 5: Operation (0:55–1:20)
- Click **Add sample records**, then **New rental**. Choose the Canon EOS R6, a customer, a return date and a deposit of 250, and click Create. The toast shows *availability: available → rented*.
- Open **New rental** again with the same camera. The server refuses: *"already has an open rental… An item cannot have two active rentals."*
- Click **Complete return**. The camera is *available* again. Refresh the page to show the records persist.

### Scene 6: The point (1:20–1:30)
- Click **Source workflow v4** in the app header to jump back to the evidence, and show the observation and the working app together.
- Close with: **"We didn't start with a specification. We started with reality."**

---

**Optional live-AI coda (if time allows):** open the pre-analyzed Path B project (for example, the tool-lending workshop clip). Show the job stages, the transcript, the sampled frames, and a rule with its cited timestamp, all produced by a local open-weight model.
