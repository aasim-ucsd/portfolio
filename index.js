import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

// ===== Step 2: show the first 3 projects on the home page =====
const projects = await fetchJSON('./lib/projects.json');
const latestProjects = projects ? projects.slice(0, 3) : [];

const projectsContainer = document.querySelector('.projects');
renderProjects(latestProjects, projectsContainer, 'h2');

// ===== Step 3: show my GitHub stats from the GitHub API =====
const githubData = await fetchGitHubData('aasim-ucsd');
const profileStats = document.querySelector('#profile-stats');

if (profileStats && githubData) {
  profileStats.innerHTML = `
    <h2>My GitHub Stats</h2>
    <dl>
      <dt>Public Repos</dt><dd>${githubData.public_repos}</dd>
      <dt>Public Gists</dt><dd>${githubData.public_gists}</dd>
      <dt>Followers</dt><dd>${githubData.followers}</dd>
      <dt>Following</dt><dd>${githubData.following}</dd>
    </dl>
  `;
}