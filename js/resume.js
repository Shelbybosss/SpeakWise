// Turns pasted resume text into interview questions, entirely on the device. The resume text itself is never stored.
import { keywordsFrom } from "./scoring.js";

const SKILLS = ["python", "java", "c++", "c#", "javascript", "typescript", "react", "angular", "node.js", "node", "express", "sql", "mysql", "postgresql", "mongodb", "firebase", "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn", "nlp", "computer vision", "opencv", "pandas", "numpy", "data analysis", "power bi", "tableau", "excel", "html", "css", "aws", "azure", "gcp", "docker", "kubernetes", "git", "linux", "android", "kotlin", "flutter", "swift", "django", "flask", "spring boot", "spring", "rest api", "figma", "autocad", "solidworks", "ansys", "matlab", "arduino", "raspberry pi", "iot", "embedded c", "verilog", "plc", "catia", "revit", "staad pro"];
const HEADERS = /^(projects?|academic projects?|personal projects?|experience|work experience|internships?|education|skills|technical skills|achievements|certifications?|extra[- ]?curricular|positions? of responsibility|hobbies|interests|summary|objective|publications|awards|languages|declaration)\b/i;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const clean = line => line.replace(/^[\s•·▪●◦\-–—*>\d.)]+/, "").split(/\s[|–—-]\s|:\s|\s\(|\|/)[0].trim();

function section(lines, test) {
  const out = []; let on = false;
  for (const l of lines) {
    if (HEADERS.test(l) && l.length < 40) { on = test.test(l); continue; }
    if (on) out.push(l);
  }
  return out;
}

export function questionsFromResume(text) {
  const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const lower = " " + lines.join(" ").toLowerCase() + " ";
  const skills = SKILLS.filter(s => new RegExp("(^|[^a-z+#])" + esc(s) + "($|[^a-z+#])").test(lower))
    .filter((s, _, all) => !all.some(o => o.startsWith(s + " ") || o.startsWith(s + "."))).slice(0, 4);

  let projectLines = section(lines, /project/i);
  if (!projectLines.length) projectLines = lines.filter(l => /\bproject\b/i.test(l));
  const projects = [...new Set(projectLines.map(clean).filter(t => t.length >= 4 && t.length <= 60 && t.split(/\s+/).length <= 9 && !/[.!?]$/.test(t)))].slice(0, 3);

  const jobs = [...new Set(section(lines, /experience|internship/i).map(clean).filter(t => t.length >= 3 && t.length <= 60 && t.split(/\s+/).length <= 8))].slice(0, 2);

  const q = [];
  projects.forEach(p => {
    const kw = keywordsFrom(p, 3);
    q.push([`Walk me through your project “${p}”`, `${kw} problem solution role result`, `What would you do differently if you built “${p}” again?`]);
    q.push([`What was the hardest problem in “${p}”, and how did you solve it?`, `${kw} problem challenge solve debug result`, "How did you check that your fix worked?"]);
  });
  jobs.forEach(j => q.push([`What did you learn from “${j}”?`, "learn work team responsibility skill result", "What would you do differently there?"]));
  skills.forEach(s => q.push([`How have you used ${s} in a real project?`, `${s.split(/\W/)[0] || s} project example problem result`, `What is one limitation of ${s}?`]));
  if (q.length) q.push(["Pick one line on your resume and prove it with an example", "example project result skill evidence", "Which line on your resume are you least confident about?"]);
  return q.slice(0, 12);
}
