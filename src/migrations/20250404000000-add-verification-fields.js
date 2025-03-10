// src/migrations/YYYYMMDD-add-verification-fields.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'isVerified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    
    await queryInterface.addColumn('Users', 'verificationToken', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('Users', 'verificationTokenExpires', {
      type: Sequelize.DATE,
      allowNull: true
    });
    
    await queryInterface.addColumn('Users', 'passwordResetToken', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('Users', 'passwordResetExpires', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Users', 'isVerified');
    await queryInterface.removeColumn('Users', 'verificationToken');
    await queryInterface.removeColumn('Users', 'verificationTokenExpires');
    await queryInterface.removeColumn('Users', 'passwordResetToken');
    await queryInterface.removeColumn('Users', 'passwordResetExpires');
  }
};