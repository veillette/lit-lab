const express = require("express");
const lti = require("ltijs").Provider;

const router = express.Router();
router.use(express.json());

/**
 * POST /api/grade
 *
 * Body: { scoreGiven: number, scoreMaximum: number }
 *
 * Publishes the score to Moodle via LTI AGS (Assignment & Grade Services).
 * Requires a valid LTI session (ltik cookie set by LTIJS).
 */
router.post("/grade", async (req, res) => {
  const token = res.locals.token;
  if (!token) {
    return res.status(401).json({ error: "No active LTI session." });
  }

  const scoreGiven = Number(req.body.scoreGiven);
  const scoreMaximum = Number(req.body.scoreMaximum) || 100;

  if (isNaN(scoreGiven)) {
    return res.status(400).json({ error: "scoreGiven must be a number." });
  }

  try {
    const gradeObj = {
      userId: token.user,
      scoreGiven,
      scoreMaximum,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
      timestamp: new Date().toISOString(),
    };

    await lti.Grade.scorePublish(token, gradeObj);

    return res.json({
      success: true,
      scoreGiven,
      scoreMaximum,
      percent: Math.round((scoreGiven / scoreMaximum) * 100),
    });
  } catch (err) {
    console.error("Grade passback error:", err?.message ?? err);
    return res
      .status(500)
      .json({ error: "Grade passback failed. Check AGS configuration." });
  }
});

module.exports = router;
