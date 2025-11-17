import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/firebase-admin';
import { CreateFolderRequest, Folder } from '@/types/whim';
import { Timestamp } from 'firebase-admin/firestore';

// GET /api/folders - List all folders for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await db.collection('folders')
      .where('userId', '==', session.user.id)
      .orderBy('createdAt', 'asc')
      .get();

    const folders = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt.toDate().toISOString(),
      };
    });

    return NextResponse.json({ folders });
  } catch (error) {
    console.error('Error fetching folders:', error);
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
  }
}

// POST /api/folders - Create a new folder
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateFolderRequest = await request.json();
    const { name } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Folder name is required' },
        { status: 400 }
      );
    }

    const folderData: Omit<Folder, 'id'> = {
      userId: session.user.id,
      name: name.trim(),
      createdAt: Timestamp.now()
    };

    const docRef = await db.collection('folders').add(folderData);
    const folder: Folder = {
      id: docRef.id,
      ...folderData
    };

    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    console.error('Error creating folder:', error);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
