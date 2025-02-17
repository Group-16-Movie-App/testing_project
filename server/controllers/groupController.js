import pool from '../config/database.js';


export const getGroups = async (req, res) => {
    try {
        const result = await pool.query(`SELECT g.id, g.name, g.description, g.owner, g.created, 
                                        ARRAY_AGG(m.account_id) FILTER (WHERE m.account_id IS NOT NULL) AS members,
                                        COUNT(m.account_id) AS member_count
                                        FROM groups g
                                        LEFT JOIN members m ON g.id = m.group_id
                                        GROUP BY g.id`);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ message: 'Failed to fetch groups' });
    }
};

export const getAllGroups = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM groups');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ message: 'Failed to fetch groups' });
    }
};


export const getGroupById = async (req, res) => {
    const { id } = req.params;

    try {
        const groupResult = await pool.query('SELECT * FROM groups WHERE id = $1', [id]);

        if (groupResult.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found' });
        }

        const group = groupResult.rows[0];

        const ownerResult = await pool.query('SELECT name FROM accounts WHERE id = $1', [group.owner]);

        if (ownerResult.rows.length === 0) {
            return res.status(404).json({ message: 'Owner not found' });
        }

       
        group.owner_name = ownerResult.rows[0].name;

        res.status(200).json(group);  
    } catch (error) {
        console.error('Error fetching group:', error);
        res.status(500).json({ message: 'Failed to fetch group' });
    }
};



export const createGroup = async (req, res) => {
    const { name } = req.body;
    const ownerId = req.user.id;
    
    console.log('Creating group with:', { name, ownerId });

    try {
        // Start a transaction
        await pool.query('BEGIN');
        
        // Insert the new group
        const groupResult = await pool.query(
            'INSERT INTO groups (name, owner) VALUES ($1, $2) RETURNING *',
            [name, ownerId]
        );
        
        console.log('Group created:', groupResult.rows[0]);
        
        const groupId = groupResult.rows[0].id;
        
        // Add owner as a member with 'owner' role
        const memberResult = await pool.query(
            'INSERT INTO members (group_id, account_id, role) VALUES ($1, $2, $3) RETURNING *',
            [groupId, ownerId, 'owner']
        );
        
        console.log('Member added:', memberResult.rows[0]);
        
        await pool.query('COMMIT');
        
        // Return complete group data
        res.status(201).json({
            id: groupId,
            name,
            ownerId,
            members: [memberResult.rows[0]]
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Detailed error creating group:', {
            error: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // Send more specific error message
        if (error.code === '23505') { // Unique violation
            res.status(400).json({ message: 'A group with this name already exists' });
        } else if (error.code === '23503') { // Foreign key violation
            res.status(400).json({ message: 'Invalid owner ID' });
        } else {
            res.status(500).json({ 
                message: 'Failed to create group',
                details: error.message 
            });
        }
    }
};

export const deleteGroup = async (req, res) => {
    const { groupId } = req.params;

    try {
        await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
        res.json({ message: 'Group deleted successfully' });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ message: 'Failed to delete group' });
    }
};

export const leaveGroup = async (req, res) => {
    const { groupId } = req.params;
    const memberId = req.user.id;

    try {
        // Check if the user is the owner of the group
        const isOwnerQuery = `SELECT owner FROM groups WHERE id = $1`;
        const ownerResult = await pool.query(isOwnerQuery, [groupId]);

        if (ownerResult.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found' });
        }

        const currentOwnerId = ownerResult.rows[0].owner;

        if (memberId === currentOwnerId) {
            // If the user is the owner, check if there are other members to transfer ownership
            const memberQuery = `
                SELECT account_id 
                FROM members 
                WHERE group_id = $1 AND role = 'member' 
                ORDER BY random() 
                LIMIT 1`;
            const memberResult = await pool.query(memberQuery, [groupId]);

            if (memberResult.rows.length > 0) {
                // Transfer ownership to another member
                const newOwnerId = memberResult.rows[0].account_id;
                const updateOwnerQuery = `UPDATE groups SET owner = $1 WHERE id = $2`;
                await pool.query(updateOwnerQuery, [newOwnerId, groupId]);

                // Update the new owner role in the members table
                const updateMemberRoleQuery = `
                    UPDATE members 
                    SET role = 'owner' 
                    WHERE group_id = $1 AND account_id = $2`;
                await pool.query(updateMemberRoleQuery, [groupId, newOwnerId]);

                // Remove the current owner from the members table
                await pool.query('DELETE FROM members WHERE group_id = $1 AND account_id = $2', [groupId, memberId]);

                return res.status(200).json({
                    message: 'You have left the group successfully, and ownership has been transferred.',
                    newOwnerId,
                });
            } else {
                // No other members, delete the group
                const deleteGroupQuery = `DELETE FROM groups WHERE id = $1`;
                await pool.query(deleteGroupQuery, [groupId]);

                return res.status(200).json({ message: 'You were the last member. The group has been deleted.' });
            }
        } else {
            // If the user is not the owner, simply remove them from the members table
            const deleteMemberQuery = `
                DELETE FROM members 
                WHERE group_id = $1 AND account_id = $2`;
            await pool.query(deleteMemberQuery, [groupId, memberId]);

            return res.status(200).json({ message: 'You have left the group successfully.' });
        }
    } catch (error) {
        console.error('Error leaving group:', error);
        return res.status(500).json({ message: 'An error occurred while trying to leave the group' });
    }
};


export const getGroupMembers = async (req, res) => {
    const { id } = req.params;
    console.log(`Fetching group members for group id: ${id}`);

    try {
        const result = await pool.query(
            'SELECT a.id, a.name, (a.id = g.owner) AS isOwner FROM members m ' +
            'JOIN accounts a ON m.account_id = a.id ' +
            'JOIN groups g ON m.group_id = g.id ' +
            'WHERE m.group_id = $1',
            [id]
        );
        console.log('Group Members:', result.rows);

        const groupOwnerResult = await pool.query(
            'SELECT a.name FROM groups g JOIN accounts a ON g.owner = a.id WHERE g.id = $1',
            [id]
        );
        console.log('Group Owner:', groupOwnerResult.rows);

        const ownerName = groupOwnerResult.rows[0].name;

        res.status(200).json({
            members: result.rows,
            ownerName: ownerName,
        });
    } catch (error) {
        console.error('Error fetching group members:', error);
        res.status(500).json({ message: 'Failed to fetch group members' });
    }
};


export const addMember = async (req, res) => {
    const { groupId } = req.params;
    const { email } = req.body;

    try {
        const accountResult = await pool.query('SELECT id FROM accounts WHERE email = $1', [email]);
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const accountId = accountResult.rows[0].id;

        await pool.query('INSERT INTO members (group_id, account_id) VALUES ($1, $2)', [groupId, accountId]);
        res.status(201).json({ message: 'Member added successfully' });
    } catch (error) {
        console.error('Error adding member:', error);
        res.status(500).json({ message: 'Failed to add member' });
    }
};

export const removeMember = async (req, res) => {
    const { groupId, memberId } = req.params;

    try {
        await pool.query('DELETE FROM members WHERE group_id = $1 AND account_id = $2', [groupId, memberId]);
        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error('Error removing member:', error);
        res.status(500).json({ message: 'Failed to remove member' });
    }
};

export const getMembershipRequests = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM membership_requests WHERE group_id = $1',
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching membership requests:', error);
        res.status(500).json({ message: 'Failed to fetch membership requests' });
    }
};

export const acceptOrRejectMember = async (req, res) => {
    const { groupId, memberId } = req.params;
    const { action } = req.body;
    if (action === 'accept') {
        try {
            await pool.query('INSERT INTO members (group_id, account_id) VALUES ($1, $2)', [groupId, memberId]);
            await pool.query('DELETE FROM membership_requests WHERE group_id = $1 AND account_id = $2', [groupId, memberId]);
            res.json({ message: 'Member accepted successfully' });
        } catch (error) {
            console.error('Error accepting member:', error);
            res.status(500).json({ message: 'Failed to accept member' });
        }
    } else if (action === 'reject') {
        try {
            await pool.query('DELETE FROM membership_requests WHERE group_id = $1 AND account_id = $2', [groupId, memberId]);
            res.json({ message: 'Member rejected successfully' });
        } catch (error) {
            console.error('Error rejecting member:', error);
            res.status(500).json({ message: 'Failed to reject member' });
        }
    }
};

export const addMovieToGroup = async (req, res) => {
    const { groupId } = req.params;
    const { title, description } = req.body;

    try {
        // Assuming you have a movies table to store group movies
        await pool.query('INSERT INTO group_movies (group_id, title, description) VALUES ($1, $2, $3)', [groupId, title, description]);
        res.status(201).json({ message: 'Movie added to group successfully' });
    } catch (error) {
        console.error('Error adding movie to group:', error);
        res.status(500).json({ message: 'Failed to add movie to group' });
    }
};

export const getGroupMovies = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM group_movies WHERE group_id = $1',
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching group movies:', error);
        res.status(500).json({ message: 'Failed to fetch group movies' });
    }
};

export const addScheduleToGroup = async (req, res) => {
    const { groupId } = req.params;
    const { movieId, showtime } = req.body;

    try {
        // Ensure movieId is an integer
        const parsedMovieId = parseInt(movieId, 10);
        if (isNaN(parsedMovieId)) {
            return res.status(400).json({ message: 'Invalid movie ID' });
        }

        await pool.query('INSERT INTO group_schedules (group_id, movie_id, showtime) VALUES ($1, $2, $3)', [groupId, parsedMovieId, showtime]);
        res.status(201).json({ message: 'Schedule added successfully' });
    } catch (error) {
        console.error('Error adding schedule to group:', error);
        res.status(500).json({ message: 'Failed to add schedule' });
    }
};

export const getGroupSchedules = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM group_schedules WHERE group_id = $1',
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching group schedules:', error);
        res.status(500).json({ message: 'Failed to fetch group schedules' });
    }
};

export const getGroup = async (req, res) => {
    const { id } = req.params;

    try {
        const groupResult = await pool.query(
            'SELECT g.*, a.name AS owner_name FROM groups g ' +
            'JOIN accounts a ON g.owner = a.id ' +
            'WHERE g.id = $1',
            [id]
        );

        console.log('Group Result:', groupResult.rows); // Log the result of the query

        if (groupResult.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found' });
        }

        const membersResult = await pool.query(
            'SELECT m.*, a.email FROM members m ' +
            'JOIN accounts a ON m.account_id = a.id ' +
            'WHERE m.group_id = $1',
            [id]
        );

        const group = {
            ...groupResult.rows[0],
            members: membersResult.rows
        };

        res.json(group);
    } catch (error) {
        console.error('Error fetching group:', error);
        res.status(500).json({ message: 'Failed to fetch group details' });
    }
};

//to get group discussions and comments
export const getGroupComments = async (req, res) => {
    const { groupId } = req.params;

    try {
        const result = await pool.query(
            'SELECT c.id, c.text, c.created_at, a.name AS user_name FROM comments c ' +
            'JOIN accounts a ON c.account_id = a.id ' +
            'WHERE c.group_id = $1 ORDER BY c.created_at DESC',
            [groupId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No comments found for this group' });
        }

        res.json(result.rows); // Return the comments
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Failed to fetch comments', error: error.message });
    }
};

export const addGroupComment = async (req, res) => {
    const { groupId } = req.params;
    const { text } = req.body; // Get the comment text from the request body
    const userId = req.user.id; // Get the user ID from the authenticated user

    try {
        const result = await pool.query(
            'INSERT INTO comments (group_id, account_id, text) VALUES ($1, $2, $3) RETURNING *',
            [groupId, userId, text]
        );
        res.status(201).json(result.rows[0]); // Return the newly created comment
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ message: 'Failed to add comment' , error: error.message});
    }
};

export const likeComment = async (req, res) => {
    const { commentId } = req.params;
    const userId = req.user.id; // Assuming you have user authentication
    console.log('User ID:', userId);
    console.log('Comment ID:', commentId);
    try {
        // Check if the user has already liked the comment
        const existingLike = await pool.query('SELECT * FROM comment_likes WHERE comment_id = $1 AND account_id = $2', [commentId, userId]);
        
        if (existingLike.rows.length > 0) {
            return res.status(400).json({ message: 'You have already liked this comment' });
        }

        // Insert a new like
        await pool.query('INSERT INTO comment_likes (comment_id, account_id) VALUES ($1, $2)', [commentId, userId]);
        
        res.status(200).json({ message: 'Comment liked successfully' });
    } catch (error) {
        console.error('Error liking comment:', error);
        res.status(500).json({ message: 'Failed to like comment' });
    }
};

export const getCommentLikes = async (req, res) => {
    const { commentId } = req.params;

    try {
        const result = await pool.query('SELECT COUNT(*) AS likes FROM comment_likes WHERE comment_id = $1', [commentId]);
        res.status(200).json({ likes: parseInt(result.rows[0].likes) });
    } catch (error) {
        console.error('Error fetching like count:', error);
        res.status(500).json({ message: 'Failed to fetch like count' });
    }
};


export const requestToJoinGroup = async (req, res) => {
    const { groupId } = req.params; 
    const userId = req.user.id;  
    const userName = req.body.userName; 
    console.log('userName: ', userName) 

    try {
      
        const groupResult = await pool.query("SELECT * FROM groups WHERE id = $1", [groupId]);
        if (groupResult.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found' });
        }
        const group = groupResult.rows[0];

        const isMemberResult = await pool.query(
            "SELECT * FROM members WHERE group_id = $1 AND account_id = $2",
            [groupId, userId]
        );
        if (isMemberResult.rows.length > 0) {
            return res.status(400).json({ message: 'You are already a member of this group' });
        }

        await pool.query(
            "INSERT INTO membership_requests (group_id, account_id, user_name) VALUES ($1, $2, $3)",
            [groupId, userId, userName]
        );

        res.status(200).json({ message: 'Join request sent' });
    } catch (error) {
        console.error('Error processing join request:', error);
        res.status(500).json({ message: 'Error processing join request', error });
    }
};


export const handleMembershipRequest = async (req, res) => {
    const { groupId, memberId } = req.params;
    const userId = req.user.id; 

    try {
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

      
        if (group.owner !== userId) {
            return res.status(403).json({ message: 'Only the owner can approve/reject requests' });
        }

        const requestIndex = group.requests.findIndex(req => req.userId === memberId);
        if (requestIndex === -1) {
            return res.status(404).json({ message: 'Request not found' });
        }

      
        const request = group.requests.splice(requestIndex, 1); 
        group.members.push(request[0]); 
        await group.save();

        res.status(200).json({ message: 'Membership request accepted' });
    } catch (error) {
        res.status(500).json({ message: 'Error handling membership request', error });
    }
};

export const getUserById = async (req, res) => {
    const userId = req.params.id;
    try {
       
        const result = await pool.query('SELECT name FROM accounts WHERE id = $1', [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ name: result.rows[0].name });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Error fetching user' });
    }
};

export const getCreatedGroups = async (req, res) => {
    const { userId } = req.params;

    try {
        const result = await pool.query(
            'SELECT * FROM groups WHERE owner = $1',
            [userId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching created groups:', error);
        res.status(500).json({ message: 'Failed to fetch created groups' });
    }
};

export const getAllPosts = async (req, res) => {
    const query = `SELECT p.*, a.name, g.name as group_name FROM posts p
    JOIN accounts a ON p.account_id = a.id
    JOIN groups g ON p.group_id = g.id
    WHERE p.group_id = $1 ORDER BY created DESC`;
    try {
        const { groupId } = req.params;
        if (!groupId) {
            return res.status(400).json({
                message: "Group ID is required"
            });
        }        
        const getPost = await pool.query( query, [groupId]);
        res.status(200).json({
            message: "Fetching posts successfully",
            posts: getPost.rows
        })

    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).json({
          message: "Failed to fetch posts",
          error: error.message,
        });
    }
}

export const createAMoviePost = async (req, res) => {
    const query = `INSERT INTO posts (account_id, group_id, title, description, movie_id)
    VALUES ($1, $2, $3, $4, $5) RETURNING *`;
    try {
        const { title, description, movieId} = req.body;
        const { groupId } = req.params;
        const userId = req.user.id;
        if (!title || !description ||!movieId) {
            return res.status(400).json({
                message: "Title, description and movieId are required"
            })
        }
        if (!groupId) {
            return res.status(400).json({
                message: "Group ID is required"
            });
        }        
        if (!userId) {
            return res.status(401).json({
                message: "User ID not found"
            })
        }
        const newPost = await pool.query( query, [userId, groupId, title, description, movieId]);
        if (!newPost.rows.length) {
            return res.status(500).json({ message: "Failed to create post" });
        }
        res.status(201).json({
            message: "New Post is created successfully",
            postInfo: newPost
        })
    } catch (error) {
        console.error("Error creating post:", error);
        res.status(500).json({
          message: "Failed to create post",
          error: error.message,
        });
    }
} 

export const deleteAPost = async (req, res) => {
    const query = `DELETE FROM posts WHERE id = $1 AND group_id = $2`;
    try {
        const { postId, groupId } = req.params; // Extract id and groupId from request parameters
        
        // Execute the query with both id and groupId
        const result = await pool.query(query, [postId, groupId]);
        
        if (result.rowCount === 0) {
            // If no rows are affected, the post wasn't found or doesn't belong to the group
            return res.status(404).json({ message: "Post not found or you don't have access" });
        }
        
        // Successfully deleted
        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).json({
          message: "Failed to delete post",
          error: error.message,
        });
    }
};

