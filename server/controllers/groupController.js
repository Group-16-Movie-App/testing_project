import GroupDiscussion from '../../movie/src/components/GroupDiscussion.js';
import pool from '../config/database.js';


export const getGroups = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM groups'); // Adjust the query based on your database schema
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
        const result = await pool.query(
            'SELECT g.*, a.name as owner_name FROM groups g ' +
            'JOIN accounts a ON g.owner = a.id ' +
            'WHERE g.id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching group:', error);
        res.status(500).json({ message: 'Failed to fetch group' });
    }
};

export const createGroup = async (req, res) => {
    const { name } = req.body;
    const owner = req.user.id;
    
    console.log('Creating group with:', { name, owner });
    
    const ownerId = req.user.id; // Assuming you have user authentication and can get the user ID

    try {
        // Start a transaction
        await pool.query('BEGIN');
        
        // Insert the new group
        const groupResult = await pool.query(
            'INSERT INTO groups (name, owner) VALUES ($1, $2) RETURNING *',
            [name, owner]
        // Insert the new group with the owner ID
        const result = await pool.query(
            'INSERT INTO groups (name, owner) VALUES ($1, $2) RETURNING *',
            [name, ownerId] // Include the owner ID in the query
        );
        
        console.log('Group created:', groupResult.rows[0]);
        
        const groupId = groupResult.rows[0].id;
        
        // Add owner as a member with 'owner' role
        const memberResult = await pool.query(
            'INSERT INTO members (group_id, account_id, role) VALUES ($1, $2, $3) RETURNING *',
            [groupId, owner, 'owner']
        );
        
        console.log('Member added:', memberResult.rows[0]);
        
        await pool.query('COMMIT');
        
        // Return complete group data
        res.status(201).json({
            id: groupId,
            name,
            owner,
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
    const memberId = req.user.id; // Get the member ID from the authenticated user

    try {
        await pool.query('DELETE FROM members WHERE group_id = $1 AND account_id = $2', [groupId, memberId]);
        res.json({ message: 'You have left the group successfully' });
    } catch (error) {
        console.error('Error leaving group:', error);
        res.status(500).json({ message: 'Failed to leave group' });
    }
};

export const getGroupMembers = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM members WHERE group_id = $1',
            [id]
        );
        res.json(result.rows);
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

export const acceptMember = async (req, res) => {
    const { groupId, memberId } = req.params;

    try {
        await pool.query('DELETE FROM membership_requests WHERE group_id = $1 AND account_id = $2', [groupId, memberId]);
        await pool.query('INSERT INTO members (group_id, account_id) VALUES ($1, $2)', [groupId, memberId]);
        res.json({ message: 'Member accepted successfully' });
    } catch (error) {
        console.error('Error accepting member:', error);
        res.status(500).json({ message: 'Failed to accept member' });
    }
};

export const rejectMember = async (req, res) => {
    const { groupId, memberId } = req.params;

    try {
        await pool.query('DELETE FROM membership_requests WHERE group_id = $1 AND account_id = $2', [groupId, memberId]);
        res.json({ message: 'Member rejected successfully' });
    } catch (error) {
        console.error('Error rejecting member:', error);
        res.status(500).json({ message: 'Failed to reject member' });
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
        await pool.query('INSERT INTO group_schedules (group_id, movie_id, showtime) VALUES ($1, $2, $3)', [groupId, movieId, showtime]);
        res.status(201).json({ message: 'Schedule added to group successfully' });
    } catch (error) {
        console.error('Error adding schedule to group:', error);
        res.status(500).json({ message: 'Failed to add schedule to group' });
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
            'SELECT g.*, a.email as owner_email FROM groups g ' +
            'JOIN accounts a ON g.owner = a.id ' +
            'WHERE g.id = $1',
            [id]
        );

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
            'SELECT c.id, c.text, c.created_at, a.name AS user_name FROM comments c JOIN accounts a ON c.account_id = a.id WHERE c.group_id = $1 ORDER BY c.created_at DESC',
            [groupId]
        );

        // Check if any comments were found
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No comments found for this group' });
        }

        res.json(result.rows); // Return the comments
    } catch (error) {
        console.error('Error fetching comments:', error); // Log the error details
        res.status(500).json({ message: 'Failed to fetch comments', error: error.message }); // Return error message
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