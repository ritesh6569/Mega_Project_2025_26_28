const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Blockchain = require('../blockchain');
const { auth } = require('../middleware/auth');
const EmailService = require('../services/emailService');

// Initialize IPFS service using simple HTTP approach
const IPFSServiceSimple = require('../services/ipfsServiceSimple');
const ipfsService = new IPFSServiceSimple();

// Initialize email service
const emailService = new EmailService();

// Configure multer for memory storage (we'll upload directly to IPFS)
const storage = multer.memoryStorage();
const upload = multer({ storage });

const bc = new Blockchain(parseInt(process.env.DIFFICULTY || '2'));

function fileSha256(buffer) {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

// Document upload (protected route - any authenticated user)
router.post('/admin/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    
    // Calculate file hash
    const fileHash = fileSha256(req.file.buffer);
    
    // Upload file to IPFS
    const ipfsResult = await ipfsService.addFileFromBuffer(req.file.buffer, req.file.originalname);
    
    if (!ipfsResult.success) {
      return res.status(500).json({ error: 'Failed to upload to IPFS', details: ipfsResult.error });
    }

    const data = {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      fileHash,
      ipfsHash: ipfsResult.ipfsHash,
      ipfsUrl: ipfsService.getIPFSUrl(ipfsResult.ipfsHash),
      uploadedAt: new Date(),
      mockMode: ipfsResult.mockMode || false
    };

    const block = await bc.addBlock(data);
    
    // Send email notification
    try {
      const emailResult = await emailService.sendUploadSuccessEmail(
        req.user.email,
        req.file.originalname,
        fileHash,
        data.ipfsUrl
      );
      if (emailResult && emailResult.success) {
        console.log('Upload success email sent to:', req.user.email);
      } else {
        console.error('Failed to send upload success email:', emailResult && emailResult.error ? emailResult.error : 'Unknown error');
      }
    } catch (emailError) {
      console.error('Failed to send upload success email:', emailError);
      // Don't fail the upload if email fails
    }
    
    return res.json({ 
      success: true, 
      block,
      ipfsUrl: data.ipfsUrl,
      ipfsHash: data.ipfsHash,
      mockMode: data.mockMode,
      message: data.mockMode ? 'IPFS not running - using mock mode for demonstration' : 'File uploaded successfully to IPFS'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// User verify
router.post('/user/verify', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    
    // Calculate file hash
    const fileHash = fileSha256(req.file.buffer);

    const found = await bc.findBlockByFileHash(fileHash);
    const result = {
      match: !!found,
      fileHash,
      foundBlock: found || null,
      ipfsUrl: found ? found.data.ipfsUrl : null,
      ipfsHash: found ? found.data.ipfsHash : null
    };

    // Send email notification based on verification result
    try {
      if (result.match) {
        const emailResult = await emailService.sendVerificationSuccessEmail(
          req.user.email,
          req.file.originalname,
          fileHash,
          result.ipfsUrl
        );
        if (emailResult && emailResult.success) {
          console.log('Verification success email sent to:', req.user.email);
        } else {
          console.error('Failed to send verification success email:', emailResult && emailResult.error ? emailResult.error : 'Unknown error');
        }
      } else {
        const emailResult = await emailService.sendVerificationFailureEmail(
          req.user.email,
          req.file.originalname,
          fileHash
        );
        if (emailResult && emailResult.success) {
          console.log('Verification failure email sent to:', req.user.email);
        } else {
          console.error('Failed to send verification failure email:', emailResult && emailResult.error ? emailResult.error : 'Unknown error');
        }
      }
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail the verification if email fails
    }

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get file from IPFS
router.get('/file/:ipfsHash', async (req, res) => {
  try {
    const { ipfsHash } = req.params;
    const result = await ipfsService.getFile(ipfsHash);
    
    if (!result.success) {
      return res.status(404).json({ error: 'File not found in IPFS', details: result.error });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(result.buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get file info from IPFS
router.get('/file-info/:ipfsHash', async (req, res) => {
  try {
    const { ipfsHash } = req.params;
    const result = await ipfsService.getFileInfo(ipfsHash);
    
    if (!result.success) {
      return res.status(404).json({ error: 'File not found in IPFS', details: result.error });
    }

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Check IPFS connection
router.get('/ipfs/status', async (req, res) => {
  try {
    const status = await ipfsService.isConnected();
    return res.json(status);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Check email service status
router.get('/email/status', async (req, res) => {
  try {
    const status = await emailService.testConnection();
    return res.json(status);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;