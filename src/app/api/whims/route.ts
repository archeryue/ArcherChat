import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/firebase-admin';
import { CreateWhimRequest, Whim } from '@/types/whim';
import { Timestamp } from 'firebase-admin/firestore';

// GET /api/whims - List all whims for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const folderId = request.nextUrl.searchParams.get('folderId');

    let query = db.collection('whims')
      .where('userId', '==', session.user.id)
      .orderBy('updatedAt', 'desc');

    if (folderId) {
      query = query.where('folderId', '==', folderId) as any;
    }

    const snapshot = await query.get();
    const whims = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt.toDate().toISOString(),
        updatedAt: data.updatedAt.toDate().toISOString(),
      };
    });

    console.log(`[Whims API] Returning ${whims.length} whims for user:`, session.user.id);
    if (whims.length > 0) {
      console.log('[Whims API] First whim:', whims[0]);
    }

    return NextResponse.json({ whims });
  } catch (error) {
    console.error('Error fetching whims:', error);
    return NextResponse.json({ error: 'Failed to fetch whims' }, { status: 500 });
  }
}

// POST /api/whims - Create a new whim
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateWhimRequest = await request.json();
    const { title, content, blocks, folderId, conversationId } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Missing required field: title' },
        { status: 400 }
      );
    }

    const now = Timestamp.now();
    const whimData: Omit<Whim, 'id'> = {
      userId: session.user.id,
      title,
      createdAt: now,
      updatedAt: now,
      ...(conversationId && { conversationId }),
      ...(folderId && { folderId }),
      // Support both old (content) and new (blocks) format
      ...(content && { content }),
      ...(blocks && { blocks })
    };

    const docRef = await db.collection('whims').add(whimData);
    const whim: Whim = {
      id: docRef.id,
      ...whimData
    };

    return NextResponse.json({ whim }, { status: 201 });
  } catch (error) {
    console.error('Error creating whim:', error);
    return NextResponse.json({ error: 'Failed to create whim' }, { status: 500 });
  }
}
