import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/firebase-admin';
import { UpdateFolderRequest, Folder } from '@/types/whim';

// PUT /api/folders/[id] - Update a folder
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await db.collection('folders').doc(params.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    const folder = { id: doc.id, ...doc.data() } as Folder;

    // Verify ownership
    if (folder.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: UpdateFolderRequest = await request.json();
    const { name } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Folder name is required' },
        { status: 400 }
      );
    }

    await db.collection('folders').doc(params.id).update({
      name: name.trim()
    });

    const updatedDoc = await db.collection('folders').doc(params.id).get();
    const updatedFolder = { id: updatedDoc.id, ...updatedDoc.data() } as Folder;

    return NextResponse.json({ folder: updatedFolder });
  } catch (error) {
    console.error('Error updating folder:', error);
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }
}

// DELETE /api/folders/[id] - Delete a folder
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await db.collection('folders').doc(params.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    const folder = { id: doc.id, ...doc.data() } as Folder;

    // Verify ownership
    if (folder.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if folder has whims
    const whimsSnapshot = await db.collection('whims')
      .where('folderId', '==', params.id)
      .limit(1)
      .get();

    if (!whimsSnapshot.empty) {
      return NextResponse.json(
        { error: 'Cannot delete folder with whims. Move or delete whims first.' },
        { status: 400 }
      );
    }

    await db.collection('folders').doc(params.id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
