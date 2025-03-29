const { DataTypes } = require('sequelize');
const slugify = require('slugify');

module.exports = (sequelize) => {
  const WatchlistCategory = sequelize.define('WatchlistCategory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    coverImagePath: {
      type: DataTypes.STRING,
      allowNull: true
    },
    likesCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    slug: {
      type: DataTypes.STRING(150),
      allowNull: true,
      unique: true
    }
  }, {
    tableName: 'WatchlistCategories',
    timestamps: true,
    hooks: {
      beforeCreate: async (category) => {
        // Generate a unique slug based on the name and user ID
        const baseSlug = slugify(category.name, { lower: true, strict: true });
        category.slug = `${baseSlug}-${category.userId}-${Date.now().toString(36)}`;
      },
      beforeUpdate: async (category) => {
        // Regenerate the slug if the name changes
        if (category.changed('name')) {
          const baseSlug = slugify(category.name, { lower: true, strict: true });
          category.slug = `${baseSlug}-${category.userId}-${Date.now().toString(36)}`;
        }
      }
    }
  });

  // Instance methods
  WatchlistCategory.prototype.incrementLikes = async function() {
    this.likesCount += 1;
    return this.save();
  };

  WatchlistCategory.prototype.decrementLikes = async function() {
    if (this.likesCount > 0) {
      this.likesCount -= 1;
      return this.save();
    }
    return this;
  };

  return WatchlistCategory;
};