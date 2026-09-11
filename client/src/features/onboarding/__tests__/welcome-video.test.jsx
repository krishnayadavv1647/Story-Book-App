import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WelcomeVideo } from '../WelcomeVideo.jsx';
import { useAuthStore } from '../../../store/authStore.js';
import { useConfigStore } from '../../../store/configStore.js';
import { useWelcomeStore } from '../../../store/welcomeStore.js';

const VIDEO = 'https://youtu.be/OCIQ9DEDE8c';

function signIn(id = 'u1') {
  useAuthStore.setState({ status: 'authenticated', user: { id, name: 'Reader' } });
}

beforeEach(() => {
  localStorage.clear();
  useWelcomeStore.setState({ open: false });
  useConfigStore.setState({ welcomeVideoUrl: VIDEO, status: 'loaded' });
  signIn();
});

describe('the welcome video', () => {
  it('opens by itself for someone who has not seen it', async () => {
    render(<WelcomeVideo />);

    expect(await screen.findByText('Welcome to StoryBook Studio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play the welcome video' })).toBeInTheDocument();
  });

  it('does not come back once it has been dismissed', async () => {
    const { unmount } = render(<WelcomeVideo />);

    await userEvent.click(await screen.findByRole('button', { name: /Got it/ }));
    await waitFor(() =>
      expect(screen.queryByText('Welcome to StoryBook Studio')).not.toBeInTheDocument(),
    );

    // A fresh visit: remounted, store reset, same account.
    unmount();
    useWelcomeStore.setState({ open: false });
    render(<WelcomeVideo />);

    expect(screen.queryByText('Welcome to StoryBook Studio')).not.toBeInTheDocument();
  });

  it('is remembered per account, not per browser', async () => {
    const first = render(<WelcomeVideo />);
    await userEvent.click(await screen.findByRole('button', { name: /Got it/ }));
    first.unmount();

    // Somebody else signs in on the same machine and still gets their welcome.
    useWelcomeStore.setState({ open: false });
    signIn('u2');
    render(<WelcomeVideo />);

    expect(await screen.findByText('Welcome to StoryBook Studio')).toBeInTheDocument();
  });

  it('loads the player only when play is pressed', async () => {
    render(<WelcomeVideo />);
    const dialog = await screen.findByRole('dialog');

    expect(dialog.querySelector('iframe')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Play the welcome video' }));

    const player = await screen.findByTitle('StoryBook Studio welcome video');
    expect(player.getAttribute('src')).toMatch(/youtube-nocookie\.com\/embed\/OCIQ9DEDE8c\?/);
    expect(player.getAttribute('src')).toContain('autoplay=1');
    // Without a referrer YouTube shows "Error 153" instead of the video.
    expect(player).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  });

  it('links out to YouTube in a new tab', async () => {
    render(<WelcomeVideo />);

    const link = await screen.findByRole('link', { name: /Watch on YouTube/ });
    expect(link).toHaveAttribute('href', VIDEO);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows nothing when the server has switched it off', () => {
    useConfigStore.setState({ welcomeVideoUrl: null });
    render(<WelcomeVideo />);

    expect(screen.queryByText('Welcome to StoryBook Studio')).not.toBeInTheDocument();
  });

  it('shows nothing to someone who is not signed in', () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null });
    render(<WelcomeVideo />);

    expect(screen.queryByText('Welcome to StoryBook Studio')).not.toBeInTheDocument();
  });

  it('closes with the app around it, so the next person does not inherit it open', async () => {
    const { unmount } = render(<WelcomeVideo />);
    await screen.findByText('Welcome to StoryBook Studio');

    unmount();

    expect(useWelcomeStore.getState().open).toBe(false);
  });

  it('opens again on request, after it has been seen', async () => {
    localStorage.setItem('sb.welcomeVideoSeen.u1', '1');
    render(<WelcomeVideo />);
    expect(screen.queryByText('Welcome to StoryBook Studio')).not.toBeInTheDocument();

    // What the "Watch it again" button in Settings does.
    act(() => useWelcomeStore.getState().show());

    expect(await screen.findByText('Welcome to StoryBook Studio')).toBeInTheDocument();
  });
});
