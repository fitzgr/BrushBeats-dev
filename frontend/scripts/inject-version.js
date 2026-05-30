#!/usr/bin/env node
/* global process */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HISTORY_LIMIT = 200;

function runGit(command, fallback = '') {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim();
  } catch {
    return fallback;
  }
}

function getTagsByCommitSha() {
  const raw = runGit('git show-ref --tags -d', '');
  if (!raw) {
    return new Map();
  }

  const tagToSha = new Map();

  raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [sha, refName] = line.split(' ');
      if (!sha || !refName || !refName.startsWith('refs/tags/')) {
        return;
      }

      const isPeeledTagRef = refName.endsWith('^{}');
      const normalizedRefName = isPeeledTagRef ? refName.slice(0, -3) : refName;
      const tagName = normalizedRefName.replace('refs/tags/', '').trim();
      if (!tagName) {
        return;
      }

      const existingTagMeta = tagToSha.get(tagName) || {};
      if (isPeeledTagRef) {
        existingTagMeta.peeledSha = sha;
      } else {
        existingTagMeta.directSha = sha;
      }

      tagToSha.set(tagName, existingTagMeta);
    });

  const commitToTags = new Map();
  for (const [tagName, shaMeta] of tagToSha.entries()) {
    const commitSha = shaMeta.peeledSha || shaMeta.directSha;
    if (!commitSha) {
      continue;
    }

    if (!commitToTags.has(commitSha)) {
      commitToTags.set(commitSha, []);
    }

    commitToTags.get(commitSha).push(tagName);
  }

  for (const tags of commitToTags.values()) {
    tags.sort((left, right) => left.localeCompare(right));
  }

  return commitToTags;
}

function getGitCommitHistory(limit) {
  const tagsByCommitSha = getTagsByCommitSha();
  const raw = runGit(
    // Use branches and tags only so stash/reflog metadata never appears in app history.
    `git log --branches --tags --date=iso-strict --pretty=format:"%H%x1f%h%x1f%ad%x1f%an%x1f%s%x1f%b%x1e" -${limit}`,
    ''
  );

  if (!raw) {
    return [];
  }

  return raw
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, shortSha, timestamp, author, subject, body] = entry
        .split('\x1f')
        .map((value) => String(value || '').trim());

      if (!sha || !timestamp || !subject) {
        return null;
      }

      return {
        id: `commit-${sha}`,
        kind: 'commit',
        source: 'git-history',
        sha,
        shortSha,
        timestamp,
        date: String(timestamp || '').slice(0, 10),
        author: author || 'BrushBeats',
        subject,
        body: String(body || '').trim(),
        tags: tagsByCommitSha.get(sha) || []
      };
    })
    .filter(Boolean);
}

function buildVersionHistory(limit) {
  return getGitCommitHistory(limit);
}

async function main() {
  try {
    const gitSha = process.env.VITE_GIT_SHA || runGit('git rev-parse HEAD', 'unknown');
    const versionHistory = buildVersionHistory(DEFAULT_HISTORY_LIMIT);

    const envContent = `VITE_GIT_SHA=${gitSha}\n`;
    const envPath = path.join(__dirname, '../.env.local');
    const generatedDir = path.join(__dirname, '../src/generated');
    const historyPath = path.join(generatedDir, 'versionHistory.json');

    fs.writeFileSync(envPath, envContent, 'utf-8');
    fs.mkdirSync(generatedDir, { recursive: true });
    fs.writeFileSync(historyPath, JSON.stringify(versionHistory, null, 2), 'utf-8');
    console.log(`✓ Version injected: ${String(gitSha).substring(0, 7)}`);
    console.log(`✓ History refreshed: ${versionHistory.length} entries from git history`);
  } catch (error) {
    console.warn('⚠ Could not inject git version:', error.message);
  }
}

main();
