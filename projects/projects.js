import { fetchJSON, renderProjects } from '../global.js';

// Load all projects from the JSON file
const projects = await fetchJSON('../lib/projects.json');

// Draw them into the .projects container
const projectsContainer = document.querySelector('.projects');
renderProjects(projects, projectsContainer, 'h2');

// Step 1.6: show how many projects there are in the page title
const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle && projects) {
  projectsTitle.textContent = `${projects.length} Projects`;
} 
