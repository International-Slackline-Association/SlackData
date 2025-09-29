# run_loader.py

from slack_data.database import create_db_and_tables, get_session
from slack_data.load_data.load_weblocks import load_weblocks

def run():
    """
    Initializes the database and loads all weblock data from the JSON file.
    """
    print("--- Starting Weblock Loader Test ---")
    
    # Step 1: Create the database and tables
    # This function must be called before you can get a session.
    create_db_and_tables()

    # Step 2: Use the get_session() generator to create a session
    # The 'next()' function gets the session from the generator.
    session = next(get_session())
    
    try:
        # Step 3: Call your loader function with the created session
        load_weblocks(session=session)
    finally:
        # Step 4: Always close the session when you're done
        session.close()
    
    print("--- Test Finished ---")

# This makes the script runnable from the command line
if __name__ == "__main__":
    run()