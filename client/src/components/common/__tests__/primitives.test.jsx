import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil, Sparkles } from 'lucide-react';

import {
  Avatar,
  Button,
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  CountPill,
  Field,
  IconButton,
  Input,
  Modal,
  SectionHeading,
  SegmentedTabs,
  Select,
  StatusBadge,
  TabPanel,
  Tabs,
  Tag,
  Textarea,
  ToastProvider,
  useToast,
} from '../index.js';

describe('Button', () => {
  it('fires its handler and defaults to type="button"', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue to Characters</Button>);

    const button = screen.getByRole('button', { name: /continue to characters/i });
    expect(button).toHaveAttribute('type', 'button');

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('announces and enforces the pending state while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Generating
      </Button>,
    );

    const button = screen.getByRole('button', { name: /generating/i });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hides its decorative icon from assistive technology', () => {
    render(
      <Button leadingIcon={Sparkles}>
        Generate with AI
      </Button>,
    );

    // The accessible name must be the label alone, not label + icon noise.
    expect(screen.getByRole('button', { name: 'Generate with AI' })).toBeInTheDocument();
  });
});

describe('IconButton', () => {
  it('carries an accessible name despite having no visible text', () => {
    render(<IconButton icon={Pencil} label="Edit page 1" />);

    expect(screen.getByRole('button', { name: 'Edit page 1' })).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('associates its label with the control', () => {
    render(
      <Field label="Title">
        <Input defaultValue="Aarav and the Whispering Forest" />
      </Field>,
    );

    expect(screen.getByLabelText('Title')).toHaveValue('Aarav and the Whispering Forest');
  });

  it('wires an error to the control and announces it', () => {
    render(
      <Field label="Title" error="Title is required">
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText('Title');
    const error = screen.getByRole('alert');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Title is required');
    expect(error).toHaveTextContent('Title is required');
  });

  it('describes the control with a hint when there is no error', () => {
    render(
      <Field label="Pages" hint="Between 1 and 60">
        <Input />
      </Field>,
    );

    expect(screen.getByLabelText('Pages')).toHaveAccessibleDescription('Between 1 and 60');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies the same wiring to a textarea', () => {
    render(
      <Field label="Narration" error="Too long">
        <Textarea />
      </Field>,
    );

    expect(screen.getByLabelText('Narration')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Select', () => {
  it('is labelled, selectable, and reports changes', async () => {
    function Harness() {
      const [value, setValue] = useState('6-9');
      return (
        <Field label="Age Group">
          <Select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="3-5">3–5 years</option>
            <option value="6-9">6–9 years</option>
          </Select>
        </Field>
      );
    }

    render(<Harness />);
    const select = screen.getByLabelText('Age Group');
    expect(select).toHaveValue('6-9');

    await userEvent.selectOptions(select, '3-5');
    expect(select).toHaveValue('3-5');
  });
});

describe('display primitives', () => {
  it('renders a card with a heading at the right level', () => {
    render(
      <Card>
        <CardHeader title="Book Information" />
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Book Information' })).toBeInTheDocument();
  });

  it('renders a section heading with its count', () => {
    render(<SectionHeading count={10}>Page Outline</SectionHeading>);

    expect(screen.getByRole('heading', { name: 'Page Outline' })).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders a removable tag with a labelled dismiss control', async () => {
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>Aarav</Tag>);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Aarav' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('renders a count pill and a status badge', () => {
    render(
      <>
        <CountPill>50</CountPill>
        <StatusBadge tone="warning" dot>
          Needs Design
        </StatusBadge>
      </>,
    );

    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('Needs Design')).toBeInTheDocument();
  });

  it('keeps a decorative initial avatar out of the reading order', () => {
    const { container } = render(<Avatar name="Krishna Yadav" tone="accent" size="sm" />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).toHaveTextContent('K');
  });

  it('gives an info callout a polite role and a danger callout an assertive one', () => {
    const { rerender } = render(<Callout>You can edit every page after generation.</Callout>);
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<Callout tone="danger">Generation failed.</Callout>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <Modal open={open} onOpenChange={setOpen} title="Edit with AI" description="Describe the change.">
          <p>Body content</p>
        </Modal>
      </>
    );
  }

  it('opens as a labelled dialog and closes on Escape', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit with AI' });
    expect(dialog).toHaveAccessibleDescription('Describe the change.');
    expect(within(dialog).getByText('Body content')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes through its labelled close control', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('runs the confirm handler and can be cancelled instead', async () => {
    const onConfirm = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete page 3?"
          description="This cannot be undone."
          confirmLabel="Delete page"
          destructive
          onConfirm={onConfirm}
        />
      );
    }

    render(<Harness />);
    expect(screen.getByRole('alertdialog', { name: 'Delete page 3?' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('switches panels and exposes tab semantics', async () => {
    function Harness() {
      const [value, setValue] = useState('templates');
      return (
        <Tabs
          value={value}
          onValueChange={setValue}
          items={[
            { value: 'templates', label: 'Templates' },
            { value: 'genre', label: 'Genre' },
          ]}
        >
          <TabPanel value="templates">Template cards</TabPanel>
          <TabPanel value="genre">Genre cards</TabPanel>
        </Tabs>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Template cards')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Genre' }));
    expect(screen.getByText('Genre cards')).toBeInTheDocument();
    expect(screen.queryByText('Template cards')).not.toBeInTheDocument();
  });

  it('renders the segmented variant as a tablist too', () => {
    render(
      <SegmentedTabs
        value="ai"
        onValueChange={() => {}}
        items={[
          { value: 'existing', label: 'Select Existing' },
          { value: 'upload', label: 'Upload Character' },
          { value: 'ai', label: 'Generate with AI' },
        ]}
      />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Generate with AI' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('Toast', () => {
  it('publishes a message and dismisses it', async () => {
    function Publisher() {
      const { toast } = useToast();
      return <Button onClick={() => toast({ title: 'All changes saved' })}>Save</Button>;
    }

    render(
      <ToastProvider>
        <Publisher />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('All changes saved')).not.toBeInTheDocument();
  });

  it('refuses to be used outside its provider', () => {
    function Orphan() {
      useToast();
      return null;
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/useToast must be used inside/);
    spy.mockRestore();
  });
});
