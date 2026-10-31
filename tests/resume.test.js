import { test } from "node:test";
import assert from "node:assert/strict";
import { questionsFromResume } from "../js/resume.js";

const RESUME = `Priya Sharma
B.Tech Computer Engineering, 2026

PROJECTS
• Smart Attendance System | Python, OpenCV
  Built a face-recognition system that marks attendance in under two seconds.
• Campus Canteen App – React, Firebase

INTERNSHIPS
Software Intern, Infotech Solutions (May–July 2025)

SKILLS
Java, JavaScript, Python, SQL, Git, Node.js`;

test("finds projects, internships and skills", () => {
  const q = questionsFromResume(RESUME).map(x => x[0]);
  assert.ok(q.includes("Walk me through your project “Smart Attendance System”"));
  assert.ok(q.includes("Walk me through your project “Campus Canteen App”"));
  assert.ok(q.some(x => x.includes("Software Intern")));
  assert.ok(q.includes("How have you used java in a real project?"));
  assert.ok(q.includes("How have you used javascript in a real project?"), "java must not hide javascript");
  assert.ok(!q.some(x => /used node in/.test(x)), "node should be folded into node.js");
  assert.ok(q.length <= 12);
});

test("each question has keywords and a follow-up", () => {
  for (const [title, kw, follow] of questionsFromResume(RESUME)) {
    assert.ok(title.length > 10); assert.ok(kw.trim().length > 0); assert.ok(follow.length > 5);
  }
});

test("returns nothing for text without projects or skills", () => {
  assert.deepEqual(questionsFromResume("Hello, I am a student."), []);
});
