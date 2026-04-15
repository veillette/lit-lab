(() => {
  const form = document.getElementById("quiz-form");
  const resultBox = document.getElementById("quiz-result");
  const resultText = document.getElementById("result-text");
  const gradeStatus = document.getElementById("grade-status");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fieldsets = form.querySelectorAll(".question");
    let correct = 0;
    let total = fieldsets.length;
    let allAnswered = true;

    fieldsets.forEach((fs) => {
      const inputs = fs.querySelectorAll("input[type=radio]");
      const feedback = fs.querySelector(".q-feedback");
      const chosen = fs.querySelector("input[type=radio]:checked");

      if (!chosen) {
        allAnswered = false;
        feedback.textContent = "Please select an answer.";
        feedback.className = "q-feedback error";
        return;
      }

      const isCorrect =
        parseInt(chosen.value, 10) ===
        parseInt(chosen.dataset.correct, 10);

      if (isCorrect) {
        correct++;
        feedback.textContent = "Correct!";
        feedback.className = "q-feedback success";
      } else {
        feedback.textContent = "Incorrect.";
        feedback.className = "q-feedback error";
      }

      // Disable all radios in this fieldset after submission
      inputs.forEach((r) => (r.disabled = true));
    });

    if (!allAnswered) return;

    const scoreMaximum = window.QUIZ_SCORE_MAXIMUM ?? 100;
    const scoreGiven = Math.round((correct / total) * scoreMaximum);
    const percent = Math.round((correct / total) * 100);

    resultText.textContent = `You answered ${correct} of ${total} correctly — ${percent}%.`;
    resultBox.hidden = false;
    form.querySelector(".btn-submit").disabled = true;

    // Send grade to Moodle via the LTIJS backend
    gradeStatus.textContent = "Sending grade to Moodle…";
    try {
      const resp = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // sends the ltik session cookie
        body: JSON.stringify({ scoreGiven, scoreMaximum }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${resp.status}`);
      }

      gradeStatus.textContent = `Grade submitted to Moodle: ${scoreGiven} / ${scoreMaximum}.`;
    } catch (err) {
      gradeStatus.textContent = `Could not submit grade: ${err.message}`;
      console.error("Grade passback failed:", err);
    }
  });
})();
