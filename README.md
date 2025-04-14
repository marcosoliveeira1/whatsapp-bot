## Running with Docker

The `docker-compose.yml` file defines two services:

- `whatsapp-bot`: For running the production build.
- `whatsapp-bot-dev`: For development, mounting the source code and running in
  watch mode.

**Prerequisites:**

- Ensure Docker and Docker Compose are installed.
- Create and configure your `.env` file in the project root.
- Ensure RabbitMQ is running and accessible (either locally or as another Docker
  container). If running RabbitMQ as a container on the same Docker network, use
  the container name (e.g., `rabbitmq`) as the host in `AMQP_URL`.

**Commands:**

1. **Build the Image (Optional - Compose can build automatically):**
   ```bash
   docker compose build whatsapp-bot
   # or for dev
   docker compose build whatsapp-bot-dev
   ```

2. **Run in Production Mode (Detached):**
   ```bash
   docker compose up -d whatsapp-bot
   ```
   _This uses the production build defined in the `Dockerfile` and maps the host
   `./auth` directory (or the absolute path `/auth` if you modify the compose
   file) to `/app/auth` in the container for session persistence._

3. **Run in Development Mode:**
   ```bash
   docker compose up whatsapp-bot-dev
   ```
   _This mounts the project directory (`.`) into `/app` in the container and
   runs `npm run start:dev`. Changes in your local code will trigger restarts
   inside the container. Node modules are kept inside a separate volume to avoid
   conflicts._

4. **View Logs:**
   ```bash
   docker compose logs -f whatsapp-bot
   # or
   docker compose logs -f whatsapp-bot-dev
   ```

5. **Stop Services:**
   ```bash
   docker compose down
   ```

**Important Docker Volume Note:** The `docker-compose.yml` maps a volume for the
session data (`/auth:/app/auth`). Ensure the host path (`/auth` in the provided
example, which means a directory named `auth` in the root of your _filesystem_)
exists and has correct permissions, or adjust the mapping to a relative path
like `./auth:/app/auth` if you prefer the session data to be stored relative to
your `docker-compose.yml` file. The provided example uses `/auth` which might
require manual creation (`sudo mkdir /auth && sudo chown $USER:$USER /auth`) on
the host. **Using `./auth:/app/auth` is often simpler.**

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open
issues.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details (if one exists, otherwise state MIT).
