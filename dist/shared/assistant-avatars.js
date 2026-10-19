export const assistantAvatars = {
  orbit: {
    name: '小航',
    color: '#b9d9f3',
    shape:
      '<path d="M22 18V10m-4 0h8" stroke="#6584a7" stroke-width="3"/><rect x="10" y="17" width="44" height="34" rx="15" fill="#d8ebfb"/><rect x="16" y="23" width="32" height="20" rx="9" fill="#42627e"/><circle cx="24" cy="32" r="3" fill="#d5f6ff"/><circle cx="40" cy="32" r="3" fill="#d5f6ff"/><path d="M27 38q5 4 10 0" fill="none" stroke="#d5f6ff" stroke-width="2"/><path d="M6 29v10m52-10v10" stroke="#a3c3e2" stroke-width="5"/>',
  },
  cube: {
    name: '方方',
    color: '#c8c0ef',
    shape:
      '<rect x="12" y="15" width="40" height="38" rx="12" fill="#ded8fa"/><rect x="17" y="22" width="30" height="21" rx="7" fill="#655d92"/><path d="M23 30v5m18-5v5" stroke="#fff2ce" stroke-width="4" stroke-linecap="round"/><path d="M29 39h6" stroke="#fff2ce" stroke-width="2"/><circle cx="32" cy="10" r="4" fill="#f5c9dc"/>',
  },
  sprout: {
    name: '豆豆',
    color: '#bddcc4',
    shape:
      '<path d="M31 20C18 19 17 6 29 10q8 2 3 12m0-7c4-9 15-8 15-3s-9 9-15 8" fill="#87b49a"/><ellipse cx="32" cy="37" rx="22" ry="18" fill="#dfefe0"/><ellipse cx="25" cy="34" rx="3" ry="4" fill="#486659"/><ellipse cx="40" cy="34" rx="3" ry="4" fill="#486659"/><path d="M29 42q4 4 8-1" fill="none" stroke="#486659" stroke-width="2"/><ellipse cx="18" cy="40" rx="4" ry="2" fill="#edbbc2"/>',
  },
  fox: {
    name: '小狐',
    color: '#f0c6a7',
    shape:
      '<path d="M12 30 14 8l17 12L49 8l3 24q-1 22-20 23Q12 52 12 30" fill="#e9ad81"/><path d="M14 30q12-8 18 8 7-16 18-8-2 22-18 23Q16 50 14 30" fill="#fff3e5"/><path d="m20 32 6 2m12 0 6-2" stroke="#71564a" stroke-width="3" stroke-linecap="round"/><path d="m28 42 4 4 4-4" fill="#71564a"/>',
  },
  cloud: {
    name: '阿团',
    color: '#c5e4e7',
    shape:
      '<path d="M15 50C-1 43 9 22 19 24 18 7 43 8 45 24c17-2 21 20 6 25z" fill="#f2fcff"/><path d="M24 31v5m16-5v5" stroke="#5b7f91" stroke-width="3" stroke-linecap="round"/><path d="M28 42q4 4 8 0" fill="none" stroke="#5b7f91" stroke-width="2"/><circle cx="18" cy="40" r="3" fill="#f3c2d1"/><circle cx="46" cy="40" r="3" fill="#f3c2d1"/>',
  },
};
export function assistantAvatar(id = 'orbit') {
  const a = assistantAvatars[id] || assistantAvatars.orbit;
  return `<svg class="assistant-avatar" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${a.color}" opacity=".45"/>${a.shape}</svg>`;
}
