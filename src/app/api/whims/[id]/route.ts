import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/firebase-admin';
import { UpdateWhimRequest, Whim } from '@/types/whim';
import { Timestamp } from 'firebase-admin/firestore';

// GET /api/whims/[id] - Get a single whim
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await db.collection('whims').doc(params.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Whim not found' }, { status: 404 });
    }

    const data = doc.data()!;
    const whim = {
      id: doc.id,
      ...data,
      createdAt: data.createdAt.toDate().toISOString(),
      updatedAt: data.updatedAt.toDate().toISOString(),
    } as Whim;

    // Verify ownership
    if (whim.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ whim });
  } catch (error) {
    console.error('Error fetching whim:', error);
    return NextResponse.json({ error: 'Failed to fetch whim' }, { status: 500 });
  }
}

// PUT /api/whims/[id] - Update a whim
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await db.collection('whims').doc(params.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Whim not found' }, { status: 404 });
    }

    const whim = { id: doc.id, ...doc.data() } as Whim;

    // Verify ownership
    if (whim.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: UpdateWhimRequest = await request.json();
    const updates: Partial<Whim> = {
      updatedAt: Timestamp.now()
    };

    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content; // Legacy markdown
    if (body.blocks !== undefined) updates.blocks = body.blocks; // New JSON blocks format
    if (body.folderId !== undefined) updates.folderId = body.folderId;

    await db.collection('whims').doc(params.id).update(updates);

    const updatedDoc = await db.collection('whims').doc(params.id).get();
    const updatedData = updatedDoc.data()!;
    const updatedWhim = {
      id: updatedDoc.id,
      ...updatedData,
      createdAt: updatedData.createdAt.toDate().toISOString(),
      updatedAt: updatedData.updatedAt.toDate().toISOString(),
    };

    return NextResponse.json({ whim: updatedWhim });
  } catch (error) {
    console.error('Error updating whim:', error);
    return NextResponse.json({ error: 'Failed to update whim' }, { status: 500 });
  }
}

// DELETE /api/whims/[id] - Delete a whim
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await db.collection('whims').doc(params.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Whim not found' }, { status: 404 });
    }

    const whim = { id: doc.id, ...doc.data() } as Whim;

    // Verify ownership
    if (whim.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.collection('whims').doc(params.id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting whim:', error);
    return NextResponse.json({ error: 'Failed to delete whim' }, { status: 500 });
  }
}
