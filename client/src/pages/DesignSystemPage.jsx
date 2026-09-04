import { useEffect, useState } from 'react';
import { Copy, Pencil, RefreshCw, Sparkles, Trash2, Upload, Users } from 'lucide-react';

import { useAuthStore } from '../store/authStore.js';
import { AppShell, PageHeader, StickyActionBar } from '../components/layout/index.js';
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
  useToast,
} from '../components/common/index.js';

/**
 * Development reference for the design system — every primitive rendered from
 * the measured tokens, so drift is visible at a glance and the components can be
 * compared against the approved Figma frames.
 *
 * Not product surface. It is not linked from the shell navigation.
 */
function Row({ title, children }) {
  return (
    <Card className="mt-4">
      <CardHeader title={title} />
      <div className="mt-4 flex flex-wrap items-center gap-4">{children}</div>
    </Card>
  );
}

export function DesignSystemPage() {
  const { toast } = useToast();

  // The page is unauthenticated so the shell can be inspected without a session.
  // Seeding a demo account makes the sidebar render its real content.
  useEffect(() => {
    const { status, setSession } = useAuthStore.getState();
    if (status !== 'authenticated') {
      setSession({ id: 'demo', name: 'Krishna Yadav' });
    }
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tab, setTab] = useState('templates');
  const [mode, setMode] = useState('ai');

  return (
    <AppShell>
      <PageHeader
        title="Design System"
        subtitle="Every primitive, rendered from the measured Figma tokens."
        actions={
          <>
            <Button size="xl" variant="secondary" leadingIcon={RefreshCw}>
              Regenerate Plan
            </Button>
            <Button size="xl" variant="primary">
              Continue to Characters
            </Button>
          </>
        }
      />

      <div className="mt-6">
        <SectionHeading count={16}>Primitives</SectionHeading>

        <Row title="Button">
          <Button variant="primary" size="xl">
            Primary xl
          </Button>
          <Button variant="secondary" size="lg">
            Secondary lg
          </Button>
          <Button variant="secondary" size="md" leadingIcon={Sparkles}>
            With icon
          </Button>
          <Button variant="ghost" size="sm">
            Ghost sm
          </Button>
          <Button variant="primary" loading>
            Loading
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </Row>

        <Row title="IconButton">
          <IconButton icon={Pencil} label="Edit page" />
          <IconButton icon={Copy} label="Duplicate page" />
          <IconButton icon={Trash2} label="Delete page" tone="danger" />
          <IconButton icon={Pencil} label="Edit row" size="sm" />
        </Row>

        <Card className="mt-4">
          <CardHeader title="Form controls" />
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Title">
              <Input defaultValue="Aarav and the Whispering Forest" />
            </Field>
            <Field label="Age Group">
              <Select defaultValue="6-9">
                <option value="3-5">3–5 years</option>
                <option value="6-9">6–9 years</option>
              </Select>
            </Field>
            <Field label="Pages" hint="Between 1 and 60">
              <Input defaultValue="10" />
            </Field>
            <Field label="Moral" error="Moral is required">
              <Input />
            </Field>
            <Field label="Narration" className="col-span-2">
              <Textarea defaultValue="Aarav loved stories more than anything. One rainy evening, he found an old map tucked inside a book." />
            </Field>
          </div>
        </Card>

        <Row title="Tags, pills and badges">
          <Tag>Aarav</Tag>
          <Tag>Whispering Forest</Tag>
          <Tag onRemove={() => {}}>Removable</Tag>
          <CountPill>10</CountPill>
          <StatusBadge>Needs Design</StatusBadge>
          <StatusBadge tone="success" dot>
            Ready
          </StatusBadge>
          <StatusBadge tone="warning" dot>
            Generating
          </StatusBadge>
          <StatusBadge tone="danger" dot>
            Failed
          </StatusBadge>
        </Row>

        <Row title="Avatar">
          <Avatar name="Krishna Yadav" tone="accent" size="sm" />
          <Avatar name="Aarav" size="md" />
          <Avatar name="Lumi" size="md" />
        </Row>

        <Card className="mt-4">
          <CardHeader title="Callout" />
          <div className="mt-4 space-y-3">
            <Callout>You can edit every page after generation.</Callout>
            <Callout tone="danger">Page 3 failed to generate. It can be retried.</Callout>
          </div>
        </Card>

        <Card className="mt-4">
          <CardHeader title="Tabs" />
          <div className="mt-4">
            <Tabs
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'templates', label: 'Templates' },
                { value: 'genre', label: 'Genre' },
              ]}
            >
              <TabPanel value="templates" className="pt-4 text-sm text-ink-muted">
                Template cards render here.
              </TabPanel>
              <TabPanel value="genre" className="pt-4 text-sm text-ink-muted">
                Genre cards render here.
              </TabPanel>
            </Tabs>

            <SegmentedTabs
              className="mt-6"
              value={mode}
              onValueChange={setMode}
              items={[
                { value: 'existing', label: 'Select Existing', icon: Users },
                { value: 'upload', label: 'Upload Character', icon: Upload },
                { value: 'ai', label: 'Generate with AI', icon: Sparkles },
              ]}
            />
          </div>
        </Card>

        <Row title="Overlays and feedback">
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button onClick={() => setConfirmOpen(true)}>Open confirm</Button>
          <Button onClick={() => toast({ title: 'All changes saved', tone: 'success' })}>
            Show toast
          </Button>
        </Row>

        <StickyActionBar
          className="mt-6"
          sticky={false}
          status="All changes saved"
          step="Step 2 of 3"
          actions={
            <>
              <Button size="lg" variant="secondary">
                Back
              </Button>
              <Button size="lg" variant="primary">
                Continue to Characters
              </Button>
            </>
          }
        />
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Edit with AI"
        description="Describe the change you want on this page."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary">Apply edit</Button>
          </>
        }
      >
        <Field label="Instruction">
          <Textarea placeholder="Make the forest brighter and add fireflies." />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete page 3?"
        description="The page and its revisions will be removed. This cannot be undone."
        confirmLabel="Delete page"
        destructive
        onConfirm={() => setConfirmOpen(false)}
      />
    </AppShell>
  );
}

export default DesignSystemPage;
