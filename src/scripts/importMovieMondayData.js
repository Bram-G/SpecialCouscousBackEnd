const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const bcrypt = require('bcrypt');
const { 
  User, 
  Group, 
  MovieMonday, 
  MovieSelection, 
  MovieMondayEventDetails,
  MovieCast,
  MovieCrew, 
  sequelize 
} = require('../models');
require('dotenv').config();

// First, check the database schema to ensure we're working with correct columns
async function checkDatabaseSchema() {
  try {
    console.log('Checking database schema...');
    
    // Get column info for MovieSelections table
    const [movieSelectionColumns] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'MovieSelections';`
    );
    
    const columnNames = movieSelectionColumns.map(col => col.column_name);
    console.log('Available columns in MovieSelections:', columnNames);
    
    // Check for the presence of specific columns
    const hasGenres = columnNames.includes('genres');
    const hasReleaseYear = columnNames.includes('releaseYear');
    
    return {
      hasGenres,
      hasReleaseYear,
      availableColumns: columnNames
    };
  } catch (error) {
    console.error('Error checking database schema:', error);
    return {
      hasGenres: false,
      hasReleaseYear: false,
      availableColumns: []
    };
  }
}

const CSV_FILE_PATH = path.join(__dirname, '../../data/movie_monday_data.csv');

// Helper to create or get a user
async function getOrCreateUser(username, email, password) {
  try {
    // Check if user exists
    let user = await User.findOne({ where: { username } });
    
    if (!user) {
      console.log(`Creating user: ${username}`);
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await User.create({
        username,
        email,
        password: hashedPassword
      });
    }
    
    return user;
  } catch (error) {
    console.error(`Error creating/finding user ${username}:`, error);
    throw error;
  }
}

// Convert MM/DD/YYYY to YYYY-MM-DD
function formatDate(dateStr) {
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Helper to fetch movie details from TMDB
async function fetchMovieDetails(tmdbId) {
  if (!tmdbId || isNaN(tmdbId)) {
    return null;
  }

  try {
    // Fetch movie details with credits (actors and crew)
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${process.env.TMDB_API_KEY}&append_to_response=credits`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`Failed to fetch movie details for ID ${tmdbId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    return {
      tmdbMovieId: parseInt(tmdbId),
      title: data.title,
      posterPath: data.poster_path,
      genres: data.genres ? data.genres.map(g => g.name) : [],
      releaseYear: data.release_date ? parseInt(data.release_date.split('-')[0]) : null,
      // Add credits information for later use
      credits: data.credits || { cast: [], crew: [] }
    };
  } catch (error) {
    console.error(`Error fetching movie details for ID ${tmdbId}:`, error);
    // Return a basic object with just the ID if TMDB fetch fails
    return {
      tmdbMovieId: parseInt(tmdbId),
      title: `Movie ${tmdbId}`,
      posterPath: null,
      genres: [],
      releaseYear: null,
      credits: { cast: [], crew: [] }
    };
  }
}

// Process CSV rows
async function processCSVData(csvData) {
  // Ensure schema info is available
  const schemaInfo = await checkDatabaseSchema();
  
  const parsedData = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  console.log(`Parsed ${parsedData.length} rows from CSV`);
  
  // Create users with the same password
  const users = {
    Bram: await getOrCreateUser('Bram', 'bram@test.com', 'password'),
    Syd: await getOrCreateUser('Syd', 'syd@test.com', 'password'),
    Tim: await getOrCreateUser('Tim', 'tim@test.com', 'password'),
    Ellie: await getOrCreateUser('Ellie', 'ellie@test.com', 'password')
  };

  // Create the Movie Monday group
  let group = await Group.findOne({ where: { name: 'Movie Monday' } });
  
  if (!group) {
    console.log('Creating Movie Monday group');
    group = await Group.create({
      name: 'Movie Monday',
      createdById: users.Bram.id
    });
    
    // Add all users to the group
    await Promise.all(Object.values(users).map(user => 
      group.addUser(user.id)
    ));
  }

  // Process each row from the CSV
  for (const row of parsedData) {
    try {
      const formattedDate = formatDate(row.Date);
      
      // Determine picker (default to Bram if not specified or invalid)
      const pickerName = row.Picker && users[row.Picker] ? row.Picker : 'Bram';
      const pickerUserId = users[pickerName].id;
      
      console.log(`Processing MovieMonday for ${formattedDate}, picker: ${pickerName}`);
      
      // Create or update the MovieMonday
      const [movieMonday, created] = await MovieMonday.findOrCreate({
        where: { 
          date: formattedDate,
          GroupId: group.id
        },
        defaults: {
          pickerUserId,
          GroupId: group.id,
          status: 'completed' // Assuming all imported data are completed events
        }
      });
      
      if (!created) {
        // Update picker if needed
        if (movieMonday.pickerUserId !== pickerUserId) {
          movieMonday.pickerUserId = pickerUserId;
          await movieMonday.save();
        }
      }

      // Create movie selections with better handling of blank/problematic values
      const movieIds = [
        { id: row['Winning TMDB ID'], title: row['Winning Movie'], isWinner: true },
        { id: row['Movie 2 TMDB ID'], title: row['Movie #2'], isWinner: false },
        { id: row['Movie 3 TMDB ID'], title: row['Movie #3'], isWinner: false }
      ].filter(movie => {
        // Filter out any empty, NaN, or "[ ]" values
        return movie.id && 
               !isNaN(Number(movie.id)) && 
               movie.id !== '[ ]' && 
               movie.title && 
               movie.title.trim() !== '' && 
               movie.title !== '[ ]';
      });

      // Delete existing movie selections if any
      await MovieSelection.destroy({
        where: { movieMondayId: movieMonday.id }
      });

      // Create new movie selections with TMDB data
      for (const movie of movieIds) {
        const movieDetails = await fetchMovieDetails(movie.id);
        
        if (movieDetails) {
          // Create a base movie selection object with only the guaranteed columns
          const movieSelectionData = {
            movieMondayId: movieMonday.id,
            tmdbMovieId: movieDetails.tmdbMovieId,
            title: movieDetails.title,
            posterPath: movieDetails.posterPath,
            isWinner: movie.isWinner
          };
          
          // Only add genres and releaseYear if they exist in the schema
          if (schemaInfo.hasGenres) {
            movieSelectionData.genres = movieDetails.genres;
          }
          
          if (schemaInfo.hasReleaseYear) {
            movieSelectionData.releaseYear = movieDetails.releaseYear;
          }
          
          // Create the movie selection
          const movieSelection = await MovieSelection.create(movieSelectionData);
          
          // Now add cast and crew information
          if (movieDetails.credits) {
            // Process top cast members (limit to 10)
            const topCast = movieDetails.credits.cast.slice(0, 10);
            for (const actor of topCast) {
              try {
                await MovieCast.create({
                  movieSelectionId: movieSelection.id,
                  actorId: actor.id,
                  name: actor.name,
                  character: actor.character || null,
                  profilePath: actor.profile_path || null,
                  order: actor.order || null
                });
              } catch (castError) {
                console.error(`Error adding cast member ${actor.name}:`, castError.message);
              }
            }
            
            // Process important crew members (directors, writers)
            const importantJobs = ["Director", "Screenplay", "Writer"];
            const keyCrew = movieDetails.credits.crew
              .filter(person => importantJobs.includes(person.job))
              .map(person => {
                // Normalize Writer and Screenplay roles to "Writer"
                if (person.job === "Screenplay") {
                  return { ...person, job: "Writer" };
                }
                return person;
              });
            
            // Remove duplicates (same person might have multiple roles)
            const uniqueCrew = [];
            const seenPersons = new Set();
            
            for (const person of keyCrew) {
              const key = `${person.id}-${person.job}`;
              if (!seenPersons.has(key)) {
                seenPersons.add(key);
                uniqueCrew.push(person);
              }
            }
            
            // Add crew members to database
            for (const person of uniqueCrew) {
              try {
                await MovieCrew.create({
                  movieSelectionId: movieSelection.id,
                  personId: person.id,
                  name: person.name,
                  job: person.job,
                  department: person.department || null,
                  profilePath: person.profile_path || null
                });
              } catch (crewError) {
                console.error(`Error adding crew member ${person.name}:`, crewError.message);
              }
            }
            
            console.log(`Added ${topCast.length} cast and ${uniqueCrew.length} crew members to movie "${movieDetails.title}"`);
          }
        }
      }
      
      // Process event details (cocktails, dinner, dessert)
      // Properly handle empty or blank cells - ensure we don't have empty strings or "[ ]" values
      const cocktails = row.Cocktail && row.Cocktail.trim() !== "" && row.Cocktail !== "[ ]" 
        ? row.Cocktail.split(',').map(c => c.trim()).filter(Boolean) 
        : [];
        
      const meals = row.Dinner && row.Dinner.trim() !== "" && row.Dinner !== "[ ]"
        ? [row.Dinner.trim()] 
        : [];
        
      const desserts = row.Dessert && row.Dessert.trim() !== "" && row.Dessert !== "[ ]"
        ? [row.Dessert.trim()] 
        : [];
      
      try {
        // Only create event details if we have actual data
        const hasData = cocktails.length > 0 || meals.length > 0 || desserts.length > 0;
        
        // Log the values for debugging
        console.log(`Event details for ${formattedDate}:`, {
          cocktails: cocktails.length > 0 ? cocktails : "None",
          meals: meals.length > 0 ? meals : "None",
          desserts: desserts.length > 0 ? desserts : "None",
          hasData
        });
        
        if (hasData) {
          // Create or update event details using a direct approach
          const [eventDetails, eventDetailsCreated] = await MovieMondayEventDetails.findOrCreate({
            where: { 
              movieMondayId: movieMonday.id 
            },
            defaults: {
              movieMondayId: movieMonday.id,
              cocktails: JSON.stringify(cocktails.length > 0 ? cocktails : []),
              meals: JSON.stringify(meals.length > 0 ? meals : []),
              desserts: JSON.stringify(desserts.length > 0 ? desserts : []),
              notes: ""
            }
          });
          
          // If event details already existed, update them
          if (!eventDetailsCreated) {
            await eventDetails.update({
              cocktails: JSON.stringify(cocktails.length > 0 ? cocktails : []),
              meals: JSON.stringify(meals.length > 0 ? meals : []),
              desserts: JSON.stringify(desserts.length > 0 ? desserts : [])
            });
          }
          
          console.log(`Event details ${eventDetailsCreated ? 'created' : 'updated'} for date ${formattedDate}`);
        } else {
          console.log(`No event details to create for date ${formattedDate}`);
        }
      } catch (eventError) {
        console.error(`Error with event details for date ${formattedDate}:`, eventError.message);
        // Try a simpler approach if the first one fails
        try {
          console.log('Attempting simplified event details creation using raw SQL...');
          await sequelize.query(
            `INSERT INTO "MovieMondayEventDetails" 
             ("movieMondayId", "cocktails", "meals", "desserts", "createdAt", "updatedAt") 
             VALUES (?, ?, ?, ?, NOW(), NOW()) 
             ON CONFLICT ("movieMondayId") 
             DO UPDATE SET 
               "cocktails" = EXCLUDED."cocktails",
               "meals" = EXCLUDED."meals", 
               "desserts" = EXCLUDED."desserts",
               "updatedAt" = NOW();`,
            { 
              replacements: [
                movieMonday.id, 
                JSON.stringify(cocktails), 
                JSON.stringify(meals), 
                JSON.stringify(desserts)
              ],
              type: sequelize.QueryTypes.INSERT
            }
          );
          console.log('Successfully used raw SQL for event details');
        } catch (fallbackError) {
          console.error('Simplified event details creation also failed:', fallbackError.message);
        }
      }
    } catch (error) {
      console.error(`Error processing row for date ${row.Date}:`, error);
      // Continue to the next row on error
    }
  }
}

// Main function to run the import
async function importMovieMondayData() {
  try {
    console.log('Starting Movie Monday data import...');
    
    if (!fs.existsSync(CSV_FILE_PATH)) {
      console.error(`CSV file not found at path: ${CSV_FILE_PATH}`);
      return;
    }
    
    // Check database schema first
    const schemaInfo = await checkDatabaseSchema();
    global.schemaInfo = schemaInfo; // Make schema info available globally
    
    console.log('Schema check result:');
    console.log(`- genres column exists: ${schemaInfo.hasGenres}`);
    console.log(`- releaseYear column exists: ${schemaInfo.hasReleaseYear}`);
    
    // Read CSV file
    const csvData = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
    
    // Process the data
    await processCSVData(csvData);
    
    console.log('Data import completed successfully!');
  } catch (error) {
    console.error('Error importing Movie Monday data:', error);
  } finally {
    // Close database connection
    await sequelize.close();
  }
}

// Run the import
importMovieMondayData();